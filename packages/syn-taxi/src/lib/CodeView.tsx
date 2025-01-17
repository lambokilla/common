import { atDotCss } from '@iyio/at-dot-css';
import { useEffect, useState } from 'react';
import { useShiki } from './shiki';

interface CodeViewProps
{
    value?:string;
    wrap?:boolean;
    children?:string;
    language?:string;
}

export function CodeView({
    value,
    wrap,
    children,
    language,
}:CodeViewProps){

    style.root();

    const code=value||children||'';
    const sh=useShiki(language);

    const [elem,setElem]=useState<HTMLElement|null>(null);

    useEffect(()=>{
        if(!elem || !sh){
            return;
        }
        elem.innerHTML=sh.codeToHtml(code,{lang:language});

    },[sh,code,elem,language]);

    return (
        <pre className="CodeView" style={style.vars({wrap:wrap?'pre-wrap':'pre'})}><code ref={setElem}/></pre>
    )

}

const style=atDotCss({name:'CodeView',css:`
    .CodeView.pre, .CodeView > code{
        margin:0 !important;
        padding:0 !important;
        display:block !important;
        overflow-x:hidden !important;
        overflow-y:hidden !important;
        white-space:@@wrap !important;
        font-family:Courier !important;
        font-size:14px !important;
    }

`});
