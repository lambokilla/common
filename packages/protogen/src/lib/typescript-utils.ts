import { getFileNameNoExt, getPathNoExt, HashMap } from "@iyio/common";
import { ProtoContext, ProtoIndexGenerator, ProtoOutput } from "./protogen-pipeline-types";

export const protoTsTypeMap:HashMap<string>={
    'int':'number',
    'time':'number',
    'float':'number',
    'double':'number',
    '':'null'
} as const;

export const protoTsNumTypes=['number','bigint'];

export const protoGetTsType=(type:string|null|undefined):string=>{
    if(!type){
        return 'null';
    }
    return protoTsTypeMap[type]??type;
}


export const protoTsBuiltTypes=['string','number','any','bigint','boolean','date','null','void'] as const;

export const protoIsTsBuiltType=(type:string|null|undefined):boolean=>protoTsBuiltTypes.includes(type as any);

export const protoGenerateTsImports=(types:string[],importMap:HashMap<string>):string[]=>{
    const imports:HashMap<string[]>={};

    for(const t of types){
        const key=importMap[t];
        if(!key){
            throw new Error(`Unable to find type ${t} in importMap`)
        }
        let ary=imports[key];
        if(!ary){
            ary=[t];
            imports[key]=ary;
        }else if(!ary.includes(t)){
            ary.push(t);
        }
    }

    return Object.keys(imports).map(path=>`import { ${imports[path].join(', ')} } from '${path}';`);
}


export const protoPrependTsImports=(types:string[],importMap:HashMap<string>,prependTo:string[]):void=>{

    if(!types.length){
        return;
    }

    const imports=protoGenerateTsImports(types,importMap);

    if(imports.length){
        prependTo.splice(0,0,...imports);
    }
}

export const protoFormatTsComment=(comment:string,tab:string)=>(
    `${tab}/**\n${tab} * ${comment.split('\n').join(`\n${tab} * `)}\n${tab} */`
)

export const addTsImport=(im:string,packageName:string|null|undefined,imports:string[],importMap:HashMap<string>)=>{
    if(!imports.includes(im)){
        imports.push(im);
    }
    if(packageName){
        importMap[im]=packageName;
    }
}

export const protoGenerateTsIndex=(ctx:ProtoContext,generator:ProtoIndexGenerator,indexOutput:ProtoOutput):string=>
{
    const out:string[]=[];

    const exclude=generator.exclude??[];
    const root=generator.root.endsWith('/')?generator.root:generator.root+'/';

    for(const o of ctx.outputs){
        if(o===indexOutput || !o.path.startsWith(root)){
            continue;
        }

        let executed=false;
        for(const ex of exclude){
            if(typeof ex === 'string'){
                if(ex.includes('/')){
                    if(ex===o.path){
                        executed=true;
                        break;
                    }
                }else if(o.path.endsWith(ex)){
                    executed=true;
                    break;
                }
            }else if(ex.test(o.path)){
                executed=true;
                break;
            }
        }

        if(executed){
            continue;
        }

        getFileNameNoExt
        out.push(`export * from './${getPathNoExt(o.path.substring(root.length))}';`)
    }

    out.sort();

    return out.join('\n')
}
