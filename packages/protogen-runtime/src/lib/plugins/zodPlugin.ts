import { AliasLookup, asArray, getObjKeyCount, joinPaths } from "@iyio/common";
import { ProtoNode, ProtoPipelineConfigurablePlugin, getProtoPluginPackAndPath, protoChildrenToArray, protoFormatTsComment, protoGenerateTsIndex, protoGetChildrenByName, protoTsBuiltTypes, protoTsNumTypes, protoTsTypeMap } from "@iyio/protogen";
import { z } from "zod";
import { SharedTsPluginConfigScheme, getTsSchemeName } from "../sharedTsConfig";



const ZodPluginConfig=z.object(
{

    /**
     * @default .zodPackage
     */
    zodPath:z.string().optional(),

    /**
     * @default "types.ts"
     */
    zodFilename:z.string().optional(),

    /**
     * @default "types-index.ts"
     */
    zodIndexFilename:z.string().optional(),


    /**
     * @default "types"
     */
    zodPackage:z.string().optional(),

    /**
     * A comma separated list of properties that should be converted as long strings.
     */
    longStringProps:z.string().optional(),

}).merge(SharedTsPluginConfigScheme);

export const zodPlugin:ProtoPipelineConfigurablePlugin<typeof ZodPluginConfig>=
{
    configScheme:ZodPluginConfig,

    generate:async ({
        log,
        nodes,
        outputs,
        importMap,
        tab,
        packagePaths,
        namespace,
        libStyle,
    },{
        zodFilename='types.ts',
        zodPackage='types',
        zodIndexFilename='types-index.ts',
        zodPath,
        longStringProps,
        ...tsConfig
    })=>{

        const {path,packageName}=getProtoPluginPackAndPath(
            namespace,
            zodPackage,
            zodPath,
            libStyle,
            {packagePaths,indexFilename:zodIndexFilename}
        );

        const autoLong=longStringProps?longStringProps.split(',').map(s=>s.trim()):[];

        log(`zodPlugin. node count = ${nodes.length}`)

        const getFullName=(name:string)=>getTsSchemeName(name,tsConfig);

        const out:string[]=[];

        const useCustomTypes:CustomBuiltInsType[]=[];

        out.push(`// this file was autogenerated by @iyio/protogen - https://github.com/iyioio/common/packages/protogen`);
        out.push(`// generator = zodPlugin`);
        out.push(`import { z } from 'zod';`);

        for(const node of nodes){
            let anyAdded=false;
            for(const nodeType of node.types){

                let added=true;
                let nodeName=node.name;

                switch(nodeType.type){

                    case 'union':
                        addUnion(node,out,tab,getFullName);
                        break;

                    case 'enum':
                        addEnum(node,out,tab,getFullName);
                        break;

                    case 'array':
                        nodeName=addArray(node,out,tab);
                        break;

                    case 'map':
                        nodeName=addMap(node,out,tab);
                        break;

                    case 'function':
                        nodeName=node.name+'FunctionArgs';
                        addInterface({...node.children?.['args']??{
                            name:'args',
                            type:'',
                            address:'',
                            types:[]
                        },name:nodeName},out,tab,autoLong,getFullName,useCustomTypes);
                        break;

                    case 'serverFn':
                        nodeName='invoke'+node.name+'FunctionArgs';
                        addInterface({...node,name:nodeName},out,tab,autoLong,getFullName,useCustomTypes,prop=>prop.name==='input');
                        break;

                    case 'entity':
                    case 'struct':
                    case 'interface':
                    case 'class':
                    case 'event':
                    case 'type':
                        addInterface(node,out,tab,autoLong,getFullName,useCustomTypes);
                        break;

                    default:
                        added=false;
                        break;
                }

                if(added){
                    anyAdded=true;
                    if(importMap[nodeName]===packageName){
                        throw new Error(`Export conflict. ${nodeName} already exported from ${packageName}`);
                    }
                    importMap[nodeName]=packageName;
                    const fullName=getFullName(nodeName);
                    if(fullName!==nodeName){
                        importMap[fullName]=packageName;
                    }
                }
            }

            if(anyAdded){
                const names=addAlias(node,out,tab);
                if(names){
                    for(const name of names){
                        importMap[name]=packageName;
                    }
                }
            }


        }

        outputs.push({
            path:joinPaths(path,zodFilename),
            content:out.join('\n'),
        })

        outputs.push({
            path:joinPaths(path,zodIndexFilename),
            content:'',
            isPackageIndex:true,
            generator:{
                root:path,
                generator:protoGenerateTsIndex
            }
        })
    }
}

const addEnum=(node:ProtoNode,out:string[],tab:string,getFullName:(name:string)=>string)=>{

    const fullName=getFullName(node.name);

    out.push('');
    out.push(`export enum ${node.name}{`);

    if(node.children){
        for(const name in node.children){
            const child=node.children[name];
            if(!child.isContent && !child.special){
                out.push(`${tab}${child.name}${child.type?'='+child.type:''},`);
            }
        }
    }

    out.push('}')

    out.push(`export const ${fullName}=z.number().int()`);
}

const addUnion=(node:ProtoNode,out:string[],tab:string,getFullName:(name:string)=>string)=>{

    const fullName=getFullName(node.name);


    out.push('');
    out.push(`export const ${fullName}=z.enum([`);
    let added=false;

    if(node.children){
        for(const name in node.children){
            const child=node.children[name];
            if(!child.isContent && !child.special){
                added=true;
                out.push(`${tab}${JSON.stringify(child.name)},`);
            }
        }
    }

    if(!added){
        out.push(`''`);
    }

    out.push(`]);`);
    out.push(`export type ${node.name}=z.infer<typeof ${fullName}>;`);
}

const addAlias=(node:ProtoNode,out:string[],tab:string)=>{

    let hasAlias=false;
    const toAlias:AliasLookup<string>={};
    const fromAlias:AliasLookup<string>={};
    const aliasList:string[]=[];

    if(node.children){
        for(const name in node.children){
            const child=node.children[name];
            if(child.isContent || child.special){
                continue;
            }

            const aliases=protoGetChildrenByName(child,'alias',false);
            if(aliases.length){
                hasAlias=true;
                for(const a of aliases){

                    const alias=a.value??'';
                    if(aliasList.includes(alias)){
                        throw new Error(`Alias (${alias}) already included for type (${node.name})`);
                    }
                    aliasList.push(alias);
                    let record=toAlias[child.name];
                    if(!record){
                        record={default:alias,all:[]}
                        toAlias[child.name]=record;
                    }
                    record.all.push(alias);

                    record=fromAlias[alias];
                    if(!record){
                        record={default:child.name,all:[]}
                        fromAlias[alias]=record;
                    }
                    record.all.push(child.name);
                }
            }
        }
    }

    if(hasAlias){
        out.push(`export const ${node.name}ToAlias=${JSON.stringify(toAlias,null,tab)}`);
        out.push(`export const ${node.name}FromAlias=${JSON.stringify(fromAlias,null,tab)}`);
        return [`${node.name}ToAlias`,`${node.name}FromAlias`]
    }

    return null;

}

const addArray=(node:ProtoNode,out:string[],tab:string)=>{


    out.push('');
    out.push(`export const ${node.name}Ary=[`);

    if(node.children){
        for(const name in node.children){
            const child=node.children[name];
            if(child.isContent || child.special){
                continue;
            }
            out.push(`${tab}${JSON.stringify(child.name)},`);
        }
    }

    out.push(`];`);
    return node.name+'Ary';
}

const addMap=(node:ProtoNode,out:string[],tab:string)=>{


    out.push('');
    out.push(`export const ${node.name}Map={`);

    if(node.children){
        for(const name in node.children){
            const child=node.children[name];
            if(child.isContent || child.special){
                continue;
            }
            out.push(`${tab}${JSON.stringify(child.name)}:${JSON.stringify(child.value||child.name)},`);
        }
    }

    out.push(`};`);
    return node.name+'Map';
}

const addInterface=(node:ProtoNode,out:string[],tab:string,autoLong:string[],getFullName:(name:string)=>string,useCustomTypes:CustomBuiltInsType[],propFilter?:(prop:ProtoNode)=>boolean)=>{
    const fullName=getFullName(node.name);

    const children=protoChildrenToArray(node.children)
    const hasCustoms=children.some(c=>!isBuiltInType(c.type))?true:false;

    out.push('');
    if(hasCustoms){
        out.push(`const __base__${fullName}=z.object({`);
    }else{
        out.push(`export const ${fullName}=z.object({`);
    }
    const interfaceProps:string[]=[];
    const lazyProps:string[]=[];

    if(node.children){
        for(const prop of children){
            if(prop.special || prop.isContent || (propFilter && !propFilter(prop))){
                continue;
            }

            const propType=protoTsTypeMap[prop.type]??prop.type??'string';
            const isBuiltIn=isBuiltInType(propType);
            const isStringRecord=prop.types[0]?.mapType==='string';
            const isArray=prop.types[0]?.isArray;

            if(!isBuiltIn){
                interfaceProps.push(`${
                        prop.comment?protoFormatTsComment(prop.comment,tab)+'\n':''
                    }${
                        tab
                    }${
                        prop.name
                    }${
                        prop.optional?'?':''
                    }:${
                        isStringRecord?`Record<${prop.types[0]?.mapType},${propType}>`:propType
                    }${
                        isArray?'[]':''
                    };`
                );
                lazyProps.push(`${
                        tab
                    }${
                        prop.name
                    }:z.lazy(()=>${
                        isStringRecord?
                            `z.record(${getFullName(propType)})`:
                            getFullName(propType)
                    })${
                        isArray?'.array()':''
                    }${getFormatCalls(prop,propType,autoLong)}${
                        prop.optional?'.optional()':''
                    },`
                );
                continue;
            }

            const customType=getRealCustomType(propType as any);
            if(customType && !useCustomTypes.includes(propType as any)){
                useCustomTypes.push(propType as any)
            }

            out.push(`${
                    prop.comment?protoFormatTsComment(prop.comment,tab)+'\n':''
                }${
                    tab
                }${
                    prop.name
                }:${
                    customType||(isStringRecord?
                        `z.record(z.${propType}()${getFormatCalls(prop,propType,autoLong)})`:
                        `z.${propType}()${getFormatCalls(prop,propType,autoLong)}`
                    )
                }${
                    isArray?'.array()':''
                }${
                    prop.optional?'.optional()':''
                },`
            );
        }
    }

    out.push('});');
    if(hasCustoms){
        out.push(`const __lazy__${fullName}=z.object({`);
        for(const prop of lazyProps){
            out.push(prop);
        }
        out.push('});')
        out.push(`export const ${fullName}:(typeof __base__${fullName})=__base__${fullName}.merge(__lazy__${fullName}) as any;`);
    }
    if(node.comment){
        out.push(protoFormatTsComment(node.comment,''));
    }
    if(interfaceProps.length){
        out.push(`export type ${node.name}=z.infer<typeof ${hasCustoms?'__base__':''}${fullName}> & {`);

        for(const prop of interfaceProps){
            out.push(prop);
        }

        out.push('};')
    }else{
        out.push(`export type ${node.name}=z.infer<typeof ${hasCustoms?'__base__':''}${fullName}>;`);
    }
}

const customBuiltIns=['map','stringMap','numberMap','booleanMap','dateMap','bigIntMap'] as const;
type CustomBuiltInsType=typeof customBuiltIns[number];
const getRealCustomType=(type:CustomBuiltInsType)=>{
    switch(type){
        case 'map': return 'z.record(z.any())';
        case 'stringMap': return 'z.record(z.string())';
        case 'numberMap': return 'z.record(z.number())';
        case 'booleanMap': return 'z.record(z.boolean())';
        case 'dateMap': return 'z.record(z.date())';
        case 'bigIntMap': return 'z.record(z.bigint())';
        default: return null;
    }
}
const isBuiltInType=(type:string)=>{
    return protoTsBuiltTypes.includes(type as any) || customBuiltIns.includes(type as any);
}

interface AddCallOptions
{
    defaultValue?:string;
    hasMessage?:boolean;
    rawValue?:boolean;
    option?:(att:ProtoNode)=>string|null;
}
const getFormatCalls=(prop:ProtoNode,propType:string,autoLong:string[]):string=>{
    let call='';

    const add=(type:string|string[],name:string,att:ProtoNode|undefined,getValue?:((att:ProtoNode)=>string|number|null|undefined)|null,{
        defaultValue,
        hasMessage=true,
        rawValue,
        option
    }:AddCallOptions={})=>{
        if(!att){
            return;
        }
        type=asArray(type);
        if(!type.includes(propType)){
            return;
        }
        let value=getValue?.(att)??defaultValue;
        if(typeof value === 'string'){
            value=value.trim()
        }
        if(!rawValue && (typeof value ==='string')){
            value=JSON.stringify(value)
        }
        const message=option?option(att):att.children?.['message']?.value?.trim();
        call+=`.${name}(${value??''}${(message && hasMessage)?(value?',':'')+(option?message:JSON.stringify(message)):''})`

    }

    const attChildren=prop.children??{};

    if(attChildren['zod']?.value){
        call+='.'+attChildren['zod'].value;
    }

    let noAutoLength=attChildren['email']?true:false;

    if(propType==='string' && !attChildren['email'] && /(^e|E)mail($|[A-Z\d_])/.test(prop.name)){
        call+='.email()';
        noAutoLength=true;
    }

    if( !noAutoLength &&
        propType==='string' &&
        !attChildren['max'] &&
        !autoLong.includes(prop.name) &&
        !parseBool(attChildren['long']?.value,false)
    ){
        call+='.max(255)';
    }

    if(prop.type==='int' && !attChildren['int']){
        call+='.int()';
    }

    add(['string',...protoTsNumTypes],'min',attChildren['min'],att=>parseNum(att.value))
    add(['string',...protoTsNumTypes],'max',attChildren['max'],att=>parseNum(att.value))
    add(['string'],'length',attChildren['length'],att=>parseNum(att.value))
    add(['string'],'endsWith',attChildren['endsWith'],att=>att.value)
    add(['string'],'startsWith',attChildren['startsWith'],att=>att.value)
    add(['string'],'email',attChildren['email']);
    add(['string'],'url',attChildren['url']);
    add(['string'],'emoji',attChildren['emoji']);
    add(['string'],'uuid',attChildren['uuid']);
    add(['string'],'cuid',attChildren['cuid']);
    add(['string'],'cuid2',attChildren['cuid2']);
    add(['string'],'ulid',attChildren['ulid']);
    add(['string'],'nonempty',attChildren['notEmpty']);
    add(['string'],'trim',attChildren['trim'],null,{hasMessage:false});
    add(['string'],'toLowerCase',attChildren['lower'],null,{hasMessage:false});
    add(['string'],'toUpperCase',attChildren['upper'],null,{hasMessage:false});

    add('string','ip',attChildren['ip'],att=>parseObj({
        version:att.value||'v4',
        message:att.children?.['message']?.value,
    }),{hasMessage:false,rawValue:true})

    add('string','datetime',attChildren['date'],att=>parseObj({
        precision:parseNum(att.value),
        offset:Boolean(att.value),
        message:att.children?.['message']?.value,
    }),{hasMessage:false,rawValue:true})

    add('string','regex',attChildren['regex'],att=>paseRegex(att),{rawValue:true})

    add('string','includes',attChildren['includes'],att=>att.value,{
        option:att=>parseObj({
            position:parseNum(att.value),
            message:att.children?.['message']?.value,
        })
    })


    add(protoTsNumTypes,'gte',attChildren['gte'],att=>parseNum(att.value))
    add(protoTsNumTypes,'gt',attChildren['gt'],att=>parseNum(att.value))
    add(protoTsNumTypes,'lte',attChildren['lte'],att=>parseNum(att.value))
    add(protoTsNumTypes,'lt',attChildren['lt'],att=>parseNum(att.value))
    add(protoTsNumTypes,'multipleOf',attChildren['multipleOf'],att=>parseNum(att.value))
    add(protoTsNumTypes,'step',attChildren['step'],att=>parseNum(att.value))
    add(protoTsNumTypes,'int',attChildren['int'])
    add(protoTsNumTypes,'positive',attChildren['positive'])
    add(protoTsNumTypes,'negative',attChildren['negative'])
    add(protoTsNumTypes,'nonpositive',attChildren['notPositive'])
    add(protoTsNumTypes,'nonnegative',attChildren['notNegative'])
    add(protoTsNumTypes,'finite',attChildren['finite'])
    add(protoTsNumTypes,'safe',attChildren['safe'])

    add('date','min',attChildren['min'],att=>`new Date(${JSON.stringify(att.value)})`,{rawValue:true})
    add('date','max',attChildren['max'],att=>`new Date(${JSON.stringify(att.value)})`,{rawValue:true})

    return call;

}


const parseNum=(str:string|null|undefined)=>{
    if(!str){
        return undefined;
    }
    const n=Number(str);
    return isFinite(n)?n:undefined;
}

const parseObj=(obj:any)=>{
    for(const e in obj){
        const value=typeof obj[e]==='string'?obj[e].trim():obj[e];
        if(value===''){
            delete obj[e];
        }else{
            obj[e]=value;
        }
    }
    return getObjKeyCount(obj)?JSON.stringify(obj):null;
}

const paseRegex=(att:ProtoNode)=>{
    if(!att.value){
        return null;
    }
    try{
        let value=att.value??'';
        let flags:string|undefined=undefined;
        if(value.startsWith('/')){
            const i=value.lastIndexOf('/');
            flags=value.substring(i+1);
            value=value.substring(1,i);
        }
        new RegExp(value,flags);
        return '/'+value+'/'+(flags??'');
    }catch{
        return null;
    }
}

const parseBool=(value:string|undefined,defaultValue:boolean):boolean=>{
    if(!value){
        return defaultValue;
    }
    value=value.trim();
    if(!value){
        return defaultValue;
    }
    return Boolean(value);
}
