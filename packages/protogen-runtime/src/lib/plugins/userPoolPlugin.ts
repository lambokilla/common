import { protoMergeTsImports, protoNodeChildrenToAccessRequests, ProtoPipelineConfigurablePlugin } from "@iyio/protogen";
import { z } from "zod";
import { userPoolCdkTemplate } from "./userPoolCdkTemplate";

const supportedTypes=['userPool'];

const UserPoolPluginConfig=z.object(
{
    /**
     * @default .userPoolPackage
     */
    userPoolPath:z.string().optional(),

    /**
     * @default "user-pool"
     */
    userPoolPackage:z.string().optional(),

    /**
     * @default "user-pool-index.ts"
     */
    userPoolIndexFilename:z.string().optional(),

    /**
     * @default "UsrPool"
     */
   userPoolCdkConstructClassName:z.string().optional(),

    /**
     * If defined a CDK construct file will be generated that can be used to deploy the user pool
     */
    userPoolCdkConstructFile:z.string().optional(),
})

export const userPoolPlugin:ProtoPipelineConfigurablePlugin<typeof UserPoolPluginConfig>=
{
    configScheme:UserPoolPluginConfig,
    generate:async ({
        outputs,
        log,
        nodes,
        libStyle,
    },{
        //userPoolPackage='user-pool',
        //userPoolPath=userPoolPackage,
        //userPoolIndexFilename='user-pool-index.ts',
        userPoolCdkConstructClassName='UsrPool',
        userPoolCdkConstructFile=libStyle==='nx'?`packages/cdk/src/${userPoolCdkConstructClassName}.ts`:undefined,
    })=>{

        const supported=nodes.filter(n=>supportedTypes.some(t=>n.types.some(nt=>nt.type===t)));

        log(`${supported.length} supported node(s)`);
        if(!supported.length){
            return;
        }



        if(userPoolCdkConstructFile){

            const access=supported[0]?.children?.['$access'];
            const anon=supported[0]?.children?.['$anon-access'];

            outputs.push({
                path:userPoolCdkConstructFile,
                content:userPoolCdkTemplate(userPoolCdkConstructClassName,{
                    authorizedAccessRequests:access?protoNodeChildrenToAccessRequests(access):undefined,
                    unauthorizedAccessRequests:anon?protoNodeChildrenToAccessRequests(anon):undefined,
                }),
                mergeHandler:protoMergeTsImports,
            })
        }

        // todo - write a client file that can be used with iyio/auth and currentBaseUser -> currentUser
    }
}