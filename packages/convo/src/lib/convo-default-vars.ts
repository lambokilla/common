import { convoArrayFnName, convoBodyFnName, convoMapFnName, createConvoBaseTypeDef, createConvoScopeFunction, createOptionalConvoValue, makeAnyConvoType } from "./convo-lib";
import { ConvoScope } from "./convo-types";

const ifFalse=Symbol();
const ifTrue=Symbol();


const mapFn=makeAnyConvoType('map',createConvoScopeFunction({
    usesLabels:true
},scope=>{
    const obj:Record<string,any>={};
    const labels=scope.labels
    if(labels){
        for(const e in labels){
            const label=labels[e];
            if(label===undefined){
                continue;
            }
            const isOptional=typeof label === 'object'
            const index=isOptional?label.value:label;
            if(index!==undefined){
                const v=scope.paramValues?.[index]
                obj[e]=isOptional?createOptionalConvoValue(v):v;
            }
        }
    }
    return obj;
}))

const arrayFn=makeAnyConvoType('array',(scope:ConvoScope)=>{
    return scope.paramValues??[]
})

const and=createConvoScopeFunction({
    discardParams:true,
    nextParam(scope){
        const value=scope.paramValues?scope.paramValues[scope.paramValues.length-1]:undefined;
        if(value){
            return scope.i+1;
        }else{
            return false;
        }
    }
},scope=>{
    const value=scope.paramValues?scope.paramValues[scope.paramValues.length-1]:undefined;
    return value?true:false
})

export const defaultConvoVars={

    [convoBodyFnName]:createConvoScopeFunction({
        discardParams:true,
        catchReturn:true,
    }),

    string:createConvoBaseTypeDef('string'),
    number:createConvoBaseTypeDef('number'),
    int:createConvoBaseTypeDef('int'),
    time:createConvoBaseTypeDef('time'),
    void:createConvoBaseTypeDef('void'),
    boolean:createConvoBaseTypeDef('boolean'),
    any:createConvoBaseTypeDef('any'),

    ['true']:true,
    ['false']:false,
    ['null']:null,
    ['undefined']:undefined,

    [convoMapFnName]:mapFn,
    [convoArrayFnName]:arrayFn,
    and:and,
    or:createConvoScopeFunction(scope=>{
        if(!scope.paramValues?.length){
            return false;
        }
        for(let i=0;i<scope.paramValues.length;i++){
            if(scope.paramValues[i]){
                return true;
            }
        }
        return false;
    }),
    not:createConvoScopeFunction(scope=>{
        if(!scope.paramValues?.length){
            return true;
        }
        for(let i=0;i<scope.paramValues.length;i++){
            if(scope.paramValues[i]){
                return false;
            }
        }
        return true;
    }),

    if:createConvoScopeFunction({
        discardParams:true,
        nextParam(scope,parentScope){
            const value=scope.paramValues?scope.paramValues[scope.paramValues.length-1]:undefined;
            if(value){
                return scope.i+1;
            }else{
                if(parentScope){
                    parentScope.i++;
                }
                return false;
            }
        }
    },(scope)=>{
        const value=scope.paramValues?scope.paramValues[scope.paramValues.length-1]:undefined;
        return value?ifTrue:ifFalse;
    }),

    elif:createConvoScopeFunction({
        discardParams:true,
        shouldExecute(scope,parentScope){
            const prev=(parentScope?.paramValues && parentScope.paramValues[parentScope.paramValues.length-1]);
            return prev===ifFalse;
        },
        nextParam(scope){
            const value=scope.paramValues?scope.paramValues[scope.paramValues.length-1]:undefined;
            if(value){
                return scope.i+1;
            }else{
                return false;
            }
        }
    },scope=>{
        const value=scope.paramValues?scope.paramValues[scope.paramValues.length-1]:undefined;
        return value?ifTrue:ifFalse;
    }),

    else:createConvoScopeFunction({
        discardParams:true,
        shouldExecute(scope,parentScope){
            const prev=(parentScope?.paramValues && parentScope.paramValues[parentScope.paramValues.length-1]);
            return prev===ifFalse;
        },
    },()=>{
        return ifTrue;
    }),

    then:createConvoScopeFunction({
        discardParams:true,
        shouldExecute(scope,parentScope){
            const prev=(parentScope?.paramValues && parentScope.paramValues[parentScope.paramValues.length-1]);
            return prev===ifTrue;
        },
    },()=>{
        return ifTrue;
    }),

    while:createConvoScopeFunction({
        discardParams:true,
        nextParam(scope,parentScope){
            const value=scope.paramValues?scope.paramValues[scope.paramValues.length-1]:undefined;
            if(scope.i===0 && parentScope){
                delete parentScope.fromIndex;
            }
            if(scope.s.params && scope.i===scope.s.params.length-1 && parentScope){
                if(value){
                    parentScope.fromIndex=parentScope.i+1;
                    parentScope.gotoIndex=parentScope.i;
                }
            }
            if(value){
                return scope.i+1;
            }else{
                if(parentScope){
                    parentScope.i++;
                }
                return false;
            }
        }
    },(scope)=>{
        const value=scope.paramValues?scope.paramValues[scope.paramValues.length-1]:undefined;
        if(value){
            scope.ctrlData=ifTrue;
        }
        return scope.ctrlData??ifFalse;
    }),

    do:createConvoScopeFunction({
        discardParams:true,
    },()=>{
        return true
    }),

    return:createConvoScopeFunction(scope=>{
        const value=scope.paramValues?scope.paramValues[scope.paramValues.length-1]:undefined;
        scope.r=true;
        return value;
    }),

    eq:createConvoScopeFunction(scope=>{
        if(!scope.paramValues || scope.paramValues.length<2){
            return false;
        }
        for(let i=1;i<scope.paramValues.length;i++){
            if(scope.paramValues[i-1]!==scope.paramValues[i]){
                return false;
            }
        }
        return true;
    }),

    mt:createConvoScopeFunction(scope=>{
        if(!scope.paramValues || scope.paramValues.length<2){
            return false;
        }
        for(let i=1;i<scope.paramValues.length;i++){
            if(!(scope.paramValues[i-1]>scope.paramValues[i])){
                return false;
            }
        }
        return true;
    }),

    mte:createConvoScopeFunction(scope=>{
        if(!scope.paramValues || scope.paramValues.length<2){
            return false;
        }
        for(let i=1;i<scope.paramValues.length;i++){
            if(!(scope.paramValues[i-1]>=scope.paramValues[i])){
                return false;
            }
        }
        return true;
    }),

    lt:createConvoScopeFunction(scope=>{
        if(!scope.paramValues || scope.paramValues.length<2){
            return false;
        }
        for(let i=1;i<scope.paramValues.length;i++){
            if(!(scope.paramValues[i-1]<scope.paramValues[i])){
                return false;
            }
        }
        return true;
    }),

    lte:createConvoScopeFunction(scope=>{
        if(!scope.paramValues || scope.paramValues.length<2){
            return false;
        }
        for(let i=1;i<scope.paramValues.length;i++){
            if(!(scope.paramValues[i-1]<=scope.paramValues[i])){
                return false;
            }
        }
        return true;
    }),

    add:createConvoScopeFunction(scope=>{
        if(!scope.paramValues?.length){
            return undefined;
        }
        let value=scope.paramValues[0];
        for(let i=1;i<scope.paramValues.length;i++){
            const v=scope.paramValues[i];
            if(v!==undefined){
                if(value===undefined){
                    value=v;
                }else{
                    value+=v;
                }
            }
        }
        return value;
    }),

    sub:createConvoScopeFunction(scope=>{
        if(!scope.paramValues?.length){
            return undefined;
        }
        let value=scope.paramValues[0];
        for(let i=1;i<scope.paramValues.length;i++){
            const v=scope.paramValues[i];
            if(v!==undefined){
                if(value===undefined){
                    value=v;
                }else{
                    value-=v;
                }
            }
        }
        return value;
    }),

    mul:createConvoScopeFunction(scope=>{
        if(!scope.paramValues?.length){
            return undefined;
        }
        let value=scope.paramValues[0];
        for(let i=1;i<scope.paramValues.length;i++){
            const v=scope.paramValues[i];
            if(v!==undefined){
                if(value===undefined){
                    value=v;
                }else{
                    value*=v;
                }
            }
        }
        return value;
    }),

    div:createConvoScopeFunction(scope=>{
        if(!scope.paramValues?.length){
            return undefined;
        }
        let value=scope.paramValues[0];
        for(let i=1;i<scope.paramValues.length;i++){
            const v=scope.paramValues[i];
            if(v!==undefined){
                if(value===undefined){
                    value=v;
                }else{
                    value/=v;
                }
            }
        }
        return value;
    }),

    mod:createConvoScopeFunction(scope=>{
        if(!scope.paramValues?.length){
            return undefined;
        }
        let value=scope.paramValues[0];
        for(let i=1;i<scope.paramValues.length;i++){
            const v=scope.paramValues[i];
            if(v!==undefined){
                if(value===undefined){
                    value=v;
                }else{
                    value%=v;
                }
            }
        }
        return value;
    }),

    pow:createConvoScopeFunction(scope=>{
        if(!scope.paramValues?.length){
            return undefined;
        }
        let value=scope.paramValues[0];
        for(let i=1;i<scope.paramValues.length;i++){
            const v=scope.paramValues[i];
            if(v!==undefined){
                if(value===undefined){
                    value=v;
                }else{
                    value=Math.pow(value,v);
                }
            }
        }
        return value;
    }),

} as const;

Object.freeze(defaultConvoVars);

/*convo*/`
> meFn()->(
    map(
        name: string
        jeff: fart
    )

    while( true
        callHome()
        eatCheese()
    )

    if()
    then()
    else()
    elif()
    do()
    in()#
    while()#
    return()

    true
    false
    null
    undefined

    string
    number
    boolean
    bool
    time
    void

    eq()
    lt()
    lte()
    mt()
    mte()

    and()
    or()

    add()
    sub()
    mul()
    div()
    not()
    mod()
    pow()

    queue(@teaTime)


)

> system
You are a dude

> @teaTime user
`;