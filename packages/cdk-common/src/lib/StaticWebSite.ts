import { HashMap } from "@iyio/common";
import { pathExistsSync } from "@iyio/node-common";
import * as cdk from "aws-cdk-lib";
import * as cm from "aws-cdk-lib/aws-certificatemanager";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment';
import { Construct, IConstruct, Node } from "constructs";
import { ManagedProps, getDefaultManagedProps } from "./ManagedProps";
import { ParamOutput } from "./ParamOutput";
import { cdkOutputCache, cdkUseCachedOutputs } from "./cdk-lib";
import { BucketSiteContentSource, NamedFn, SiteContentSource } from "./cdk-types";
import { getRegexRedirectMapAsString } from "./getRedirectMap";

export const getStackItemName=(stack:IConstruct,name:string,maxLength=64)=>{
    const n=`${name}-${Node.of(stack).addr}`;
    return n.length>maxLength?n.substring(0,maxLength):n;
}

export interface StaticWebSiteProps
{
    nxExportedPackage?:string;
    path?:string;
    cdn?:boolean;
    domainName?:string;
    additionalDomainNames?:string[];
    envVars?:HashMap<string>;
    fallbackBucket?:s3.Bucket|string;
    createOutputs?:boolean;
    additionalSources?:SiteContentSource[];
    bucketSources?:BucketSiteContentSource[],
    redirectHandler?:NamedFn;
}

export class StaticWebSite extends Construct {

    public readonly bucketUrl:string;
    public readonly bucketIndexUrl:string;
    public readonly distributionUrl:string|null;
    public readonly domainUrl:string|null;
    public readonly url:string;

    public readonly bucketDeployment:s3Deployment.BucketDeployment;

    constructor(scope: Construct, name: string, {
        path,
        nxExportedPackage,
        cdn=false,
        domainName,
        additionalDomainNames,
        envVars,
        fallbackBucket,
        createOutputs,
        additionalSources=[],
        bucketSources=[],
        redirectHandler,
    }:StaticWebSiteProps,managed:ManagedProps=getDefaultManagedProps()){

        super(scope, name);

        if(typeof fallbackBucket === 'string'){
            const name=fallbackBucket;
            fallbackBucket=managed.buckets?.find(b=>b.name===name)?.bucket;
            if(!fallbackBucket){
                throw new Error(`No managed fallback bucket found my name ${name}`);
            }
        }

        let dir:string;
        if(path){
            dir=path;
        }else if(nxExportedPackage){
            const packageDir=nxExportedPackage.replace(/\/\\/g,'')
            const cachedDir=`../../${cdkOutputCache}/dist/packages/${packageDir}/exported`;
            const useCache=cdkUseCachedOutputs && pathExistsSync(cachedDir);

            dir=useCache?
                cachedDir:
                `../../dist/packages/${packageDir}/exported`;

            if(useCache){
                console.info(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
                console.info(`Using cached output for static website. name:${name}, outputPath:${dir}`);
                console.info(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
            }
        }else{
            throw new Error('StaticWebSite requires path or nxExportedPackage')
        }

        let dist:cf.CloudFrontWebDistribution|undefined;


        const bucket=new s3.Bucket(this,'SiteBucket',{
            websiteIndexDocument:"index.html",
            websiteErrorDocument:fallbackBucket?undefined:"index.html",
            publicReadAccess: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            blockPublicAccess:s3.BlockPublicAccess.BLOCK_ACLS,
        });

        this.bucketUrl=`https://${bucket.bucketDomainName}`;
        this.bucketIndexUrl=this.bucketUrl+'/index.html';

        this.domainUrl=null;

        if(redirectHandler){
            bucket.grantRead(redirectHandler.fn);
        }


        for(const s of additionalSources){
            if(s.fn && s.accessSiteOrigin){
                bucket.grantRead(s.fn);
            }
        }


        if(cdn){

            let certificate:cm.Certificate|undefined=undefined;
            if(domainName){
                certificate = new cm.Certificate(this, `Cert`, {
                    domainName:domainName,
                    validation:cm.CertificateValidation.fromDns(),
                    subjectAlternativeNames:additionalDomainNames,
                });
                this.domainUrl=`https://${domainName}`
            }

            const originIdent=new cf.OriginAccessIdentity(this,`OriginIdent`);

            const addBucketResourcePolicy=(bucket:s3.Bucket)=>{
                bucket.addToResourcePolicy(
                    new iam.PolicyStatement({
                        actions: ["s3:GetObject"],
                        resources: [bucket.arnForObjects("*")],
                        principals: [
                            new iam.CanonicalUserPrincipal(
                                originIdent.cloudFrontOriginAccessIdentityS3CanonicalUserId
                            ),
                        ],
                    })
                );
            }
            addBucketResourcePolicy(bucket);
            if(fallbackBucket){
                addBucketResourcePolicy(fallbackBucket);
            }

            const redirectMap=getRegexRedirectMapAsString(dir);

            const redirectBody=(isEdgeLambda:boolean,matchHandler:string)=>{
                return /*ts*/`
                    var map=${redirectMap};
                    ${isEdgeLambda?
                        'exports.handler = (event, context, callback) => {':
                        'function handler(event) {'
                    }
                        ${isEdgeLambda?
                            'var request=request = event.Records[0].cf.request;':
                            'var request=event.request;'
                        }
                        var uri=request.uri;
                        if(uri.endsWith('/')){
                            uri=uri.substring(0,uri.length-1);
                        }
                        for(var i=0;i<map.length;i++){
                            var r=map[i];
                            if(r.match.test(uri)){${'\n'+matchHandler}
                                break;
                            }
                        }
                        ${isEdgeLambda?
                            'callback(null,request);':
                            'return request;'
                        }
                    }
                `
            }

            const redirectFunc = redirectHandler?undefined:new cf.Function(
                this,
                'RedirectFn',
                {
                    // setting functionName is a workaround for a cdk bug that causes function names
                    // to get mixed up - https://github.com/aws/aws-cdk/issues/15765
                    functionName:getStackItemName(this,'RedirectFn'),

                    code:cf.FunctionCode.fromInline(redirectBody(false,/*ts*/`
                        request.uri=+r.path;
                    `))
                }
            );

            dist=new cf.CloudFrontWebDistribution(this,'Dist',{
                defaultRootObject:'index.html',
                viewerCertificate:certificate?{
                    aliases:domainName?[domainName,...(additionalDomainNames??[])]:[],
                    props:{
                        acmCertificateArn:certificate.certificateArn,
                        sslSupportMethod:'sni-only'
                    }

                }:undefined,
                originConfigs:[
                    {
                        s3OriginSource:{
                            s3BucketSource:bucket,
                            originAccessIdentity:originIdent,
                        },
                        failoverS3OriginSource:fallbackBucket?{
                            s3BucketSource:fallbackBucket,
                            originAccessIdentity:originIdent,
                        }:undefined,
                        failoverCriteriaStatusCodes:fallbackBucket?[404,403]:undefined,
                        behaviors:[{
                            isDefaultBehavior:true,
                            viewerProtocolPolicy:cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                            compress:true,
                            allowedMethods:cf.CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
                            functionAssociations:redirectFunc?[{
                                function:redirectFunc,
                                eventType:cf.FunctionEventType.VIEWER_REQUEST,
                            }]:undefined,
                            lambdaFunctionAssociations:redirectHandler?[{
                                lambdaFunction:new lambda.Function(this,'EdgeFn',{
                                    code:new lambda.InlineCode(redirectBody(true,/*ts*/`
                                        request.origin={custom:{
                                            domainName:'${redirectHandler.domain}',
                                            port:443,
                                            protocol:'https',
                                            path:'',
                                            sslProtocols:['TLSv1','TLSv1.1'],
                                            readTimeout:30,
                                            keepaliveTimeout:5,
                                            customHeaders:{}
                                        }}
                                        request.headers['host']=[{key:'host',value:'${redirectHandler.domain}'}];
                                        request.headers['x-site-original-origin-uri']=[{key:'x-site-original-origin-uri',value:request.uri}];
                                        request.headers['x-site-bucket-arn']=[{key:'x-site-bucket-arn',value:'${bucket.bucketArn}'}];
                                        request.uri=encodeURI(r.path);
                                    `)),
                                    handler:'index.handler',
                                    runtime:lambda.Runtime.NODEJS_18_X,
                                }).currentVersion,
                                eventType:cf.LambdaEdgeEventType.ORIGIN_REQUEST,
                            }]:undefined
                        }],
                    },
                    ...additionalSources.map(s=>s.source),
                    ...bucketSources.map(bucketSource=>{

                        let sourceBucket=bucketSource.bucket;
                        let sourceFallbackBucket=bucketSource.fallbackBucket;

                        if(typeof sourceBucket === 'string'){
                            const name=sourceBucket;
                            const bk=managed.buckets?.find(b=>b.name===name)?.bucket;
                            if(!bk){
                                throw new Error(`No managed source bucket found my name ${name}`);
                            }
                            sourceBucket=bk;
                        }
                        addBucketResourcePolicy(sourceBucket);

                        if(typeof sourceFallbackBucket === 'string'){
                            const name=sourceFallbackBucket;
                            const bk=managed.buckets?.find(b=>b.name===name)?.bucket;
                            if(!bk){
                                throw new Error(`No managed source fallback bucket found my name ${name}`);
                            }
                            sourceFallbackBucket=bk;
                        }
                        if(sourceFallbackBucket){
                            addBucketResourcePolicy(sourceFallbackBucket);
                        }

                        const source:cf.SourceConfiguration={
                            s3OriginSource:{
                                s3BucketSource:sourceBucket,
                                originAccessIdentity:originIdent,
                                originPath:bucketSource.originPath,
                            },
                            failoverS3OriginSource:sourceFallbackBucket?{
                                s3BucketSource:sourceFallbackBucket,
                                originAccessIdentity:originIdent,
                                originPath:bucketSource.fallbackOriginPath,
                            }:undefined,
                            failoverCriteriaStatusCodes:sourceFallbackBucket?[404,403]:undefined,
                            behaviors:[{
                                isDefaultBehavior:false,
                                viewerProtocolPolicy:cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                                compress:true,
                                allowedMethods:cf.CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
                                pathPattern:bucketSource.pattern.includes('*')?
                                    bucketSource.pattern:
                                    bucketSource.pattern+(bucketSource.pattern.endsWith('/')?'*':'/*'),
                            }],
                        }

                        return source;
                    }),
                ],
                errorConfigurations:[
                    {
                        errorCode:403,
                        responsePagePath:"/index.html",
                        responseCode:403,
                    },
                    {
                        errorCode:404,
                        responsePagePath:"/404.html",
                        responseCode:404,
                    },
                ],

            });

            this.distributionUrl=`https://${dist.distributionDomainName}`;

        }else{
            this.distributionUrl=null;
        }


        const sources:s3Deployment.ISource[]=[
            s3Deployment.Source.asset(dir)
        ]

        if(envVars && Object.keys(envVars).length){
            sources.push(s3Deployment.Source.jsonData("__DOT_ENV__.json",envVars));
            this.dotEnvSet=true;
        }

        this.bucketDeployment=new s3Deployment.BucketDeployment(this,'BucketDeployment',{
            destinationBucket:bucket,
            sources,

            // handles cache invalidation
            distributionPaths:dist?["/*"]:undefined,
            distribution:dist,
        });

        this.url=this.domainUrl??this.distributionUrl??this.bucketUrl;



        if(createOutputs){
            new cdk.CfnOutput(this,name+'BucketUrl',{value:this.bucketUrl});
            if(this.distributionUrl){
                new cdk.CfnOutput(this,name+'DistributionUrl',{value:this.distributionUrl});
            }
            if(this.domainUrl){
                new cdk.CfnOutput(this,name+'DomainUrl',{value:this.domainUrl});
                if(additionalDomainNames){
                    for(let i=0;i<additionalDomainNames.length;i++){
                        new cdk.CfnOutput(this,name+'DomainUrl'+(i+1),{value:additionalDomainNames[i]??''})
                    }
                }
            }
        }

    }

    private dotEnvSet=false;

    public consumeParams(paramOutput:ParamOutput):void
    {
        if(this.dotEnvSet){
            return;
        }
        this.dotEnvSet=true;
        this.bucketDeployment.addSource(s3Deployment.Source.jsonData("__DOT_ENV__.json",paramOutput.getVarMap()));
    }
}
