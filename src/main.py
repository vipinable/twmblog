import logging
import boto3
import base64
import json
import os
from botocore.exceptions import ClientError
from botocore.config import Config

import jinja2

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Create service clients
session = boto3.session.Session()
s3 = session.client('s3')

def handler(event, context):
    
    logger.info("An event received %s" % (event))
    logger.info("Response received")
    
    try:
       if event['multiValueHeaders'] and event['multiValueHeaders']['Referer'] and event['multiValueHeaders']['Referer'][0]  == 'https://login.microsoftonline.com/':
          pass
    except:
        return {
            "statusCode": 401,
            "isBase64Encoded": False,
            "headers":{
                "Access-Control-Allow-Origin":"'*'",
                "Access-Control-Allow-Methods":"GET",
                "Content-Type": "text/html; charset=utf-8"
                },
            "body": '{ "message" : "Unauthorized"}'
            }
            
    prefix = 'test1'
    bucket = os.environ.get("BUCKET")
    s3role = os.environ.get("S3ROLE")
    apiurl = os.environ.get("APIURL")
    
    logger.info("QueryString Parameters %s" % (event['queryStringParameters']))
    
    if event['queryStringParameters'] and 'd' in event['queryStringParameters']:
        download_link = create_downloadurl(bucket,event['queryStringParameters']['d'],240)
        return {
            "statusCode": 200,
            "isBase64Encoded": False,
            "headers":{
                "Access-Control-Allow-Origin":"'*'",
                "Access-Control-Allow-Methods":"GET",
                "Content-Type": "text/html; charset=utf-8"
                },
            "body": render_template(
                                    templatepath="templates/index.j2",
                                    PreFix=prefix,
                                    Objects=list_objects(bucket,prefix),
                                    DownloadFile=event['queryStringParameters']['d'],
                                    DownloadLink=download_link,
                                 )
            }
    
    elif event['queryStringParameters'] and 'fnamex' in event['queryStringParameters']:
        response = create_presigned_post(bucket,prefix + '/' + event['queryStringParameters']['fname'],60)
        return {
                "statusCode": 200,
                "isBase64Encoded": False,
                "headers":{
                    "Access-Control-Allow-Origin":"'*'",
                    "Access-Control-Allow-Methods":"GET",
                    "Content-Type": "text/html; charset=utf-8"
                    },
                "body": render_template(
                            templatepath="templates/upload_form.j2",
                            PreSignUrl=response['url'],
                            PreSignKey=response['fields']['key'],
                            PreSignAccessKey=response['fields']['AWSAccessKeyId'],
                            PreSignPolicy=response['fields']['policy'],
                            PreSignSignature=response['fields']['signature'],
                            PreSignToken=response['fields']['x-amz-security-token']
                        )
                }
    elif event['queryStringParameters'] and 'fname' in event['queryStringParameters']:
        response = create_presigned_post(bucket,prefix + '/' + event['queryStringParameters']['fname'],60)
        if event['queryStringParameters']['fname'] == "":
            return {
                "statusCode": 200,
                "isBase64Encoded": False,
                "headers":{
                    "Access-Control-Allow-Origin":"'*'",
                    "Access-Control-Allow-Methods":"GET",
                    "Content-Type": "text/html; charset=utf-8"
                    },
                "body": "Error: Filename not found"
                }
        else: 
            return {
                    "statusCode": 200,
                    "isBase64Encoded": False,
                    "headers":{
                        "Access-Control-Allow-Origin":"'*'",
                        "Access-Control-Allow-Methods":"GET,POST",
                        "Content-Type": "text/html; charset=utf-8"
                        },
                    "body": render_template(
                                templatepath="templates/index.j2",
                                PreFix=prefix,
                                Objects=list_objects(bucket,prefix),
                                PreSignUrl=response['url'],
                                PreSignKey=response['fields']['key'],
                                PreSignAccessKey=response['fields']['AWSAccessKeyId'],
                                PreSignPolicy=response['fields']['policy'],
                                PreSignSignature=response['fields']['signature'],
                                PreSignToken=response['fields']['x-amz-security-token']
                            )
                    }
        
    else:
        return {
            "statusCode": 200,
            "isBase64Encoded": False,
            "headers":{
                "Access-Control-Allow-Origin":"'*'",
                "Access-Control-Allow-Methods":"GET",
                "Content-Type": "text/html; charset=utf-8"
                },
            "body": render_template(
                                    templatepath="templates/index.j2",
                                    PreFix=prefix,
                                    Objects=list_objects(bucket,prefix),
                                 )
            }


def create_presigned_post(bucket_name, object_name, expiration,
                          fields=None, conditions=None):
    """Generate a presigned URL S3 POST request to upload a file

    :param bucket_name: string
    :param object_name: string
    :param fields: Dictionary of prefilled form fields
    :param conditions: List of conditions to include in the policy
    :param expiration: Time in seconds for the presigned URL to remain valid
    :return: Dictionary with the following keys:
        url: URL to post to
        fields: Dictionary of form fields and values to submit with the POST
    :return: None if error.
    """
    # Generate a presigned S3 POST URL
    client = boto3.client('sts')
    assumed_role_object  = client.assume_role(DurationSeconds=900,RoleArn=s3role,RoleSessionName='PreSign',)
    temp_credentials = assumed_role_object['Credentials']
    PreSign = boto3.session.Session(aws_access_key_id=temp_credentials['AccessKeyId'],
                                    aws_secret_access_key=temp_credentials['SecretAccessKey'],
                                    aws_session_token=temp_credentials['SessionToken'])
    s3 = PreSign.client('s3')
    try:
        response = s3.generate_presigned_post(bucket_name,
                                                     object_name,
                                                     Fields=fields,
                                                     Conditions=conditions,
                                                     ExpiresIn=expiration)
    except ClientError as e:
        logging.error(e)
        return None

    # The response contains the presigned URL and required fields
    return response
    
def create_downloadurl(bucket ,key, expiration):
    client = boto3.client('sts')
    assumed_role_object  = client.assume_role(DurationSeconds=900,RoleArn=s3role,RoleSessionName='PreSign',)
    temp_credentials = assumed_role_object['Credentials']
    session = boto3.session.Session(aws_access_key_id=temp_credentials['AccessKeyId'],
                                    aws_secret_access_key=temp_credentials['SecretAccessKey'],
                                    aws_session_token=temp_credentials['SessionToken'])
    s3_resource = session.resource('s3')
    bucket_name = s3_resource.Bucket(bucket).name
    params = {
        'Bucket': bucket_name,
        'Key': key
    }
    s3 = session.client('s3')
    url = s3.generate_presigned_url('get_object', Params=params, ExpiresIn=expiration)
    return (url)
    
def render_template(templatepath, *args, **kargs):
    """Generates the html body for upload form on the jinja template.

    Parameters
    ----------
        templatepath: string
            The path to the template to generate the body from

        *args, **kargs:
            The parameters are dependend on the variables inside the template.

    Return
    ------
        outputTemplate: string
            The mail body with the variables substituted in the template.

    """
    with open(templatepath) as templatefile:
        template = jinja2.Template(templatefile.read())

    outputTemplate = template.render(*args, **kargs)

    return outputTemplate
    
def list_objects(bucketname,prefix):
    logger.info("executing index function")
    client = boto3.client('s3')

    ObjectsList = client.list_objects(Bucket=bucketname,Prefix=prefix)
    
    if 'Contents' in ObjectsList:
        for object in ObjectsList['Contents']:
           logger.info("Object: %s" % (object))
    else:
        response = client.put_object(
                Body='create folder',
                Bucket=bucketname,
                Key=prefix+'/',
            )
        ObjectsList = client.list_objects(Bucket=bucketname,Prefix=prefix)
        if 'Contents' in ObjectsList:
            for object in ObjectsList['Contents']:
               logger.info("Object: %s" % (object))
               
    return ObjectsList['Contents']
    