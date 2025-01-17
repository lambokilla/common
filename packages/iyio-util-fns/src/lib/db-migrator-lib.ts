import { AwsAuthProviders } from "@iyio/aws";
import { RdsClient, applyDbMigrationAsync, forceClearAllMigrationsAsync } from "@iyio/aws-rds";
import { OnEventRequest, OnEventResponse } from "@iyio/cdk-common";
import { SqlMigration, authService } from "@iyio/common";

const physicalResourceId='SqlDbMigration_HyEQhCoDFzbiL1tfx6UU';


export async function migrateDb(
    event: OnEventRequest
): Promise<OnEventResponse> {

    console.info('create/update',JSON.stringify(event));

    const client=new RdsClient({
        awsAuth:AwsAuthProviders,
        clusterArn:event.ResourceProperties['clusterArn'],
        secretArn:event.ResourceProperties['secretArn'],
        database:event.ResourceProperties['databaseName'],
        region:process.env['AWS_REGION']??''
    },authService().userDataCache);

    client.log=true;

    await client.wakeDatabaseAsync();

    try{

        const migrations:SqlMigration[]=event.ResourceProperties['migrations']??[];
        const targetMigration:string|undefined=event.ResourceProperties['migrations'];

        const reset=event.ResourceProperties['FORCE_RESET_DATABASE_BEFORE_MIGRATING'];
        if(reset==='AND_LEAVE_EMPTY' || reset==='THEN_MIGRATE'){
            await forceClearAllMigrationsAsync(client,migrations);
        }

        if(reset!=='AND_LEAVE_EMPTY'){
            await applyDbMigrationAsync(client,migrations,targetMigration);
        }

        return {
            PhysicalResourceId:physicalResourceId
        }
    }finally{
        client.dispose();
    }

}

export async function deleteDb(event: OnEventRequest) {

    console.info('delete',event);

    if(!event.ResourceProperties['clearOnDelete']){
        return {
            PhysicalResourceId:physicalResourceId
        }
    }

    console.info('Forcefully clearing all migrations');

    const client=new RdsClient({
        awsAuth:AwsAuthProviders,
        clusterArn:event.ResourceProperties['clusterArn'],
        secretArn:event.ResourceProperties['secretArn'],
        database:event.ResourceProperties['databaseName'],
        region:process.env['AWS_REGION']??''
    },authService().userDataCache);

    client.log=true;

    await client.wakeDatabaseAsync();

    try{

        const migrations:SqlMigration[]=event.ResourceProperties['migrations']??[];

        await forceClearAllMigrationsAsync(client,migrations)

        return {
            PhysicalResourceId:physicalResourceId
        }
    }finally{
        client.dispose();
    }
}
