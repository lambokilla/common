import { asArray, getObjKeyCount, HashMap } from "@iyio/common";
import { protoChildrenToArray, ProtoContext, ProtoNode } from "@iyio/protogen";

const typeMap:HashMap<string>={
    'int':'number',
    'time':'number',
    'float':'number',
    'double':'number',
    '':'null'
};
const numTypes=['number','bigint'];
const builtIns=['string','number','any','bigint','boolean','date','null'] as const;

export interface ZodGeneratorOptions
{
    /**
     * @arg --zod-def-prefix
     */
    defPrefix?:string;
    /**
     * @arg --zod-def-suffix
     */
    defSuffix?:string;
}

export const zodGenerator=async ({
    log,
    nodes,
    outputs,
    args,
    tab,
}:ProtoContext)=>{

    log(`zodGenerator. node count = ${nodes.length}`)

    const options:Required<ZodGeneratorOptions>={
        defPrefix:args['--zod-def-prefix']?.[0]??'',
        defSuffix:args['--zod-def-suffix']?.[0]??'Scheme',
    }
    const {
        defPrefix,
        defSuffix
    }=options;

    const getFullName=(name:string)=>`${defPrefix}${name}${defSuffix}`;

    const out:string[]=[];

    const useCustomTypes:CustomBuiltInsType[]=[];

    out.push(`// this file was autogenerated by @iyio/protogen - https://github.com/iyioio/common/packages/protogen`);
    out.push(`// generator = zodGenerator`);
    out.push(`import { z } from 'zod';`);

    for(const node of nodes){

        switch(node.type){

            case 'union':
                addUnion(node,out,tab,getFullName);
                break;

            case 'enum':
                addEnum(node,out,tab,getFullName);
                break;

            case 'entity':
            case 'struct':
            case 'interface':
            case 'class':
            case 'type':
                addInterface(node,out,tab,getFullName,useCustomTypes);
                break;
        }


    }

    outputs.push({
        ext:'ts',
        content:out.join('\n'),
    })
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

    out.push(`export const ${fullName}=z.nativeEnum(${node.name})`);
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

const addInterface=(node:ProtoNode,out:string[],tab:string,getFullName:(name:string)=>string,useCustomTypes:CustomBuiltInsType[])=>{
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
            if(prop.special || prop.isContent){
                continue;
            }

            const propType=typeMap[prop.type]??prop.type??'string';
            const isBuiltIn=isBuiltInType(propType);

            if(!isBuiltIn){
                interfaceProps.push(`${
                        prop.comment?formatComment(prop.comment,tab)+'\n':''
                    }${
                        tab
                    }${
                        prop.name
                    }${
                        prop.optional?'?':''
                    }:${
                        propType
                    };`
                );
                lazyProps.push(`${
                        tab
                    }${
                        prop.name
                    }:z.lazy(()=>${
                        getFullName(propType)
                    })${
                        prop.types[0]?.isArray?'.array()':''
                    }${getFormatCalls(prop,propType)}${
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
                    prop.comment?formatComment(prop.comment,tab)+'\n':''
                }${
                    tab
                }${
                    prop.name
                }:${
                    customType||`z.${propType}()${getFormatCalls(prop,propType)}`
                }${
                    prop.types[0]?.isArray?'.array()':''
                }${
                    prop.optional?'.optional()':''
                },`
            );
        }
    }

    out.push('});');
    if(hasCustoms){
        out.push(`export const ${fullName}=z.object({`);
        for(const prop of lazyProps){
            out.push(prop);
        }
        out.push('});')
    }
    if(node.comment){
        out.push(formatComment(node.comment,''));
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

const customBuiltIns=['stringMap','numberMap','booleanMap','dateMap','bigIntMap'] as const;
type CustomBuiltInsType=typeof customBuiltIns[number];
const getRealCustomType=(type:CustomBuiltInsType)=>{
    switch(type){
        case 'stringMap': return 'z.record(z.string())';
        case 'numberMap': return 'z.record(z.number())';
        case 'booleanMap': return 'z.record(z.boolean())';
        case 'dateMap': return 'z.record(z.date())';
        case 'bigIntMap': return 'z.record(z.bigint())';
        default: return null;
    }
}
const isBuiltInType=(type:string)=>{
    return builtIns.includes(type as any) || customBuiltIns.includes(type as any);
}

const formatComment=(comment:string,tab:string)=>(
    `${tab}/**\n${tab} * ${comment.split('\n').join(`\n${tab} * `)}\n${tab} */`
)

interface AddCallOptions
{
    defaultValue?:string;
    hasMessage?:boolean;
    rawValue?:boolean;
    option?:(att:ProtoNode)=>string|null;
}
const getFormatCalls=(prop:ProtoNode,propType:string):string=>{
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
        !parseBool(attChildren['long']?.value,false)
    ){
        call+='.max(255)';
    }

    if(propType==='number' && !attChildren['int']){
        call+='.int()';
    }

    add(['string',...numTypes],'min',attChildren['min'],att=>parseNum(att.value))
    add(['string',...numTypes],'max',attChildren['max'],att=>parseNum(att.value))
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


    add(numTypes,'gte',attChildren['gte'],att=>parseNum(att.value))
    add(numTypes,'gt',attChildren['gt'],att=>parseNum(att.value))
    add(numTypes,'lte',attChildren['lte'],att=>parseNum(att.value))
    add(numTypes,'lt',attChildren['lt'],att=>parseNum(att.value))
    add(numTypes,'multipleOf',attChildren['multipleOf'],att=>parseNum(att.value))
    add(numTypes,'step',attChildren['step'],att=>parseNum(att.value))
    add(numTypes,'int',attChildren['int'])
    add(numTypes,'positive',attChildren['positive'])
    add(numTypes,'negative',attChildren['negative'])
    add(numTypes,'nonpositive',attChildren['notPositive'])
    add(numTypes,'nonnegative',attChildren['notNegative'])
    add(numTypes,'finite',attChildren['finite'])
    add(numTypes,'safe',attChildren['safe'])

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
