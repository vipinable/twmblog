import {
  Stack, StackProps, RemovalPolicy, CfnOutput,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_certificatemanager as acm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Blog stack.
 *
 * CloudFront ──▶ S3 site bucket  (private, served via OAC)
 *
 * Optional custom domain:
 *   cdk deploy -c cfDomain=vipin.is-a.dev -c cfCertArn=arn:aws:acm:us-east-1:...
 *   ACM certificate must be in us-east-1 and already issued.
 */
export class BlogStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const cfDomain = this.node.tryGetContext('cfDomain') || '';
    const cfCertArn = this.node.tryGetContext('cfCertArn') || '';

    const certificate = cfCertArn
      ? acm.Certificate.fromCertificateArn(this, 'SiteCert', cfCertArn)
      : undefined;

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `${this.stackName} blog`,
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/404.html' },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/404.html' },
      ],
      ...(cfDomain && certificate ? {
        domainNames: [cfDomain],
        certificate,
      } : {}),
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../web'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'SiteUrl', {
      value: cfDomain ? `https://${cfDomain}` : `https://${distribution.distributionDomainName}`,
      description: 'Blog URL',
    });
    new CfnOutput(this, 'DistributionDomain', {
      value: distribution.distributionDomainName,
      description: 'CloudFront domain — point CNAME here for custom domain',
    });
    new CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID',
    });
  }
}
