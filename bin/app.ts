#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BlogStack } from '../lib/blog-stack';

const app = new cdk.App();

new BlogStack(app, `${process.env.APP_NAME || 'twmblog'}-${process.env.ENV_NAME || 'prod'}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Personal blog — S3 + CloudFront static site',
});
