import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancing';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as path from 'path';
export class LambdaWithLayer extends Stack {
//BeginStackDefinition
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    /*
    const vpc = ec2.Vpc.fromLookup(this, "tf-vpc-nn", { isDefault: false});
    new ec2.InterfaceVpcEndpoint(this, 'VPC Endpoint', {
      vpc,
      service: new ec2.InterfaceVpcEndpointService('com.amazonaws.eu-west-1.execute-api'),
      // Choose which availability zones to place the VPC endpoint in, based on
      // available AZs
      subnets: {
        availabilityZones: ['us-east-1a', 'us-east-1c']
      }
    });
    */    

    //Lambda layer creation definition
    const layer0 = new lambda.LayerVersion(this, 'LayerVersion', {
      compatibleRuntimes: [
        lambda.Runtime.PYTHON_3_6,
        lambda.Runtime.PYTHON_3_7,
        lambda.Runtime.PYTHON_3_8,
      ],
      code: lambda.Code.fromAsset(path.join(__dirname,'../../layer/bin')),
      });

    const s3Bucket = new s3.Bucket(this, 's3uplodBucket', {
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
    });

    s3Bucket.grantRead(new iam.AccountRootPrincipal());
    s3Bucket.grantPut(new iam.AccountRootPrincipal());

    //IAM policy document for cloudwatch permissions.
    const LogsWritePolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
      }),
      new iam.PolicyStatement({
        actions: [
          'sts:AssumeRole',
        ],
        resources: [s3PreSignRole.roleArn],
      })],
    });


    //IAM Lambda Execution custom role 
    const LambdaExecRole = new iam.Role(this, 'LambdaExecRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Lambda Execution Role',
      inlinePolicies: { LogsWritePolicy }
    });


    //IAM policy document for s3 Read write role.
    const s3rwRolePolicies = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        actions: [
          's3:GetObject',
          's3:PutObject',
        ],
        resources: [s3Bucket.bucketArn+'/*'],
      })],
    });


    //IAM PreSign Assume Role
    const s3PreSignRole = new iam.Role(this, 's3PreSignRole', {
      assumedBy: new iam.ArnPrincipal(LambdaExecRole.roleArn),
      description: 'Lambda Execution Role',
      inlinePolicies: { s3rwRolePolicies }
    });
      
  /*
    //API gateway authorizer function
    const apigwAuth = new lambda.Function(this, 'apigwAuth', {
      description: 'api gateway authorizer function',
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'apigwAuth.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../src')),
      timeout: Duration.seconds(60),
      role: LambdaExecRole
      }); 


    const auth = new apigateway.TokenAuthorizer(this, 'apigwAuthorizer', {
      handler: apigwAuth,
      });

    */

    const apigw = new apigateway.RestApi(this, 'apigw', {
    /* endpointTypes: [apigateway.EndpointType.PRIVATE]
      defaultMethodOptions: {
        authorizationType: apigateway.AuthorizationType.CUSTOM,
        authorizer: auth,
      }
    */
    }); 

    //Main function definition
    const fn = new lambda.Function(this, 'Function', {
      description: 'S3SUI test function',
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'main.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../src')),
      memorySize: 512,
      timeout: Duration.seconds(300),
      environment: {
        APPNAME: process.env.ApplicationName!,
        ENVNAME: process.env.Environment!,
        APIURL: `https://${apigw.restApiId}.execute-api.${this.region}.amazonaws.com/prod`,
        
      },
      }); 
     
    //API gateway integration function
    const apigwbe = new lambda.Function(this, 'apigwbe', {
      description: 'S3UI apigw backend function',
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'main.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../src')),
      timeout: Duration.seconds(30),
      layers: [layer0],
      environment: {
        APPNAME: process.env.ApplicationName!,
        ENVNAME: process.env.Environment!,
        APIURL: `https://${apigw.restApiId}.execute-api.${this.region}.amazonaws.com/`,
        S3ROLE: s3PreSignRole.roleArn,
        BUCKET: s3Bucket.bucketName
      },
      }); 

    //API gateway lambda integration
    const apigwbeIntegration = new apigateway.LambdaIntegration(apigwbe);
    apigw.root.addMethod('GET', apigwbeIntegration);

    //Attach assume role policies to lambda function
    apigwbe.role?.attachInlinePolicy(new iam.Policy(this, 'CustomAssumeRole', {
      statements: [new iam.PolicyStatement(
        {
        actions: ['sts:AssumeRole'],
        resources: [s3PreSignRole.roleArn],
        }),
        new iam.PolicyStatement({
          actions: [
            's3:*'          
          ],
          resources: [
            s3Bucket.bucketArn,
            s3Bucket.bucketArn+'/*'
          ]
        }
        )],
      }));

    var status = (process.env.Environment == 'prod') ? true : false;


    //IAM policy document for cloudwatch and s3 permissions.
    const ApiGwS3UploadPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:DescribeLogGroups',
          'logs:DescribeLogStreams',
          'logs:PutLogEvents',
          'logs:GetLogEvents',
          'logs:FilterLogEvents',
          's3:GetBucket*',
          's3:GetObject*',
          's3:List*'
        ],
        resources: [
          s3Bucket.bucketArn,
          s3Bucket.bucketArn+'/*'
        ],
      })],
    });


    //API gateway assume role 
    const ApiGwS3Upload = new iam.Role(this, 'ApiGwS3Upload', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      description: 'API gateway s3 file upload Role',
      inlinePolicies: { ApiGwS3UploadPolicy }
    });

    const apigws3endpoint = new apigateway.RestApi(this, 'apigws3endpoint', {
      }); 

    const apigws3integration = new apigateway.AwsIntegration({
      service: 's3',
      integrationHttpMethod: 'GET',
      path:  's3ui-dev-s3uplodbucket0b968d82-psl80n7td15p/',
      region: 'eu-west-1',
      options: {
        credentialsRole: ApiGwS3Upload,
      },
    });

    const v1 = apigws3endpoint.root.addResource('v1');
    const v1Method = v1.addMethod('GET', apigws3integration, { 
      apiKeyRequired: false,
      methodResponses: [
        { statusCode: '200'},
        { statusCode: '400'},
        { statusCode: '500'},
          ],
        }
      );

    const bucket = v1.addResource('{folder}');
    const object = bucket.addResource('{item}');

  //EndStack
  }}