// Package storage wraps an S3-compatible object store (AWS S3 in production,
// MinIO for local dev). The client is configured from env:
//
//	STORAGE_S3_BUCKET            required
//	STORAGE_S3_REGION            default "us-east-1"
//	STORAGE_S3_ENDPOINT          optional; set for MinIO (e.g. http://minio:9000)
//	STORAGE_S3_PUBLIC_ENDPOINT   optional; used when signing download URLs so
//	    they resolve from the browser (e.g. http://localhost:9000). Defaults
//	    to STORAGE_S3_ENDPOINT.
//	STORAGE_S3_FORCE_PATH_STYLE  "true" for MinIO
//	AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  optional static creds; when
//	    omitted, the SDK default credential chain is used (IAM role, etc.)
package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type Client struct {
	s3        *s3.Client
	presigner *s3.PresignClient
	bucket    string
}

// FromEnv constructs a Client from environment variables. Returns a nil client
// (no error) when STORAGE_S3_BUCKET is unset, so the API can start without
// object storage configured (attachment endpoints then return 503).
func FromEnv(ctx context.Context) (*Client, error) {
	bucket := os.Getenv("STORAGE_S3_BUCKET")
	if bucket == "" {
		return nil, nil
	}
	region := os.Getenv("STORAGE_S3_REGION")
	if region == "" {
		region = "us-east-1"
	}
	endpoint := os.Getenv("STORAGE_S3_ENDPOINT")
	publicEndpoint := os.Getenv("STORAGE_S3_PUBLIC_ENDPOINT")
	if publicEndpoint == "" {
		publicEndpoint = endpoint
	}
	forcePath := strings.EqualFold(os.Getenv("STORAGE_S3_FORCE_PATH_STYLE"), "true")

	opts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(region),
	}
	if ak, sk := os.Getenv("AWS_ACCESS_KEY_ID"), os.Getenv("AWS_SECRET_ACCESS_KEY"); ak != "" && sk != "" {
		opts = append(opts, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(ak, sk, os.Getenv("AWS_SESSION_TOKEN")),
		))
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}
	s3c := s3.NewFromConfig(cfg, func(o *s3.Options) {
		if endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
		}
		o.UsePathStyle = forcePath
	})
	// Presign client uses the public endpoint so the signed host matches what
	// the browser will request. Signature is bound to the host header, so we
	// can't rewrite the URL after signing — it has to be signed for the public
	// hostname up front.
	presignS3 := s3c
	if publicEndpoint != "" && publicEndpoint != endpoint {
		presignS3 = s3.NewFromConfig(cfg, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(publicEndpoint)
			o.UsePathStyle = forcePath
		})
	}
	return &Client{s3: s3c, presigner: s3.NewPresignClient(presignS3), bucket: bucket}, nil
}

// Bucket returns the configured bucket name.
func (c *Client) Bucket() string { return c.bucket }

// Put uploads body to the given key.
func (c *Client) Put(ctx context.Context, key, contentType string, body io.Reader, size int64) error {
	_, err := c.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(c.bucket),
		Key:           aws.String(key),
		Body:          body,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(size),
	})
	return err
}

// PresignGet returns a time-limited download URL.
func (c *Client) PresignGet(ctx context.Context, key string, ttl time.Duration) (string, error) {
	r, err := c.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", err
	}
	return r.URL, nil
}

// Delete removes an object.
func (c *Client) Delete(ctx context.Context, key string) error {
	_, err := c.s3.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	return err
}

// ErrNotConfigured is returned by handlers when storage is required but not set up.
var ErrNotConfigured = errors.New("object storage not configured")
