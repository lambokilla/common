import * as iam from "aws-cdk-lib/aws-iam";

export type Grantee = iam.IGrantable & {
    addToRolePolicy?(statement:iam.PolicyStatement):void;
    addToPolicy?(statement:iam.PolicyStatement):void;
}

export type CommonAccessType='read'|'write'|'invoke';

export interface AccessGranter
{
    grantName:string;
    grant?:(request:AccessRequest)=>void;
    getPolicy?:(request:AccessRequest)=>iam.PolicyStatement|iam.PolicyStatement[]|null|undefined;
}

export interface IAccessGrantGroup
{
    accessGrants:AccessGranter[];
}

export interface AccessRequest
{
    grantName:string;
    types?:CommonAccessType[];
    grantee:Grantee;
}


export interface IAccessRequestGroup
{
    accessRequests:AccessRequest[];
}