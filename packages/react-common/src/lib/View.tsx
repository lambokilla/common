import { baseLayoutCn, BaseLayoutProps } from '@iyio/common';
import React, { CSSProperties } from 'react';

export interface ViewProps extends BaseLayoutProps
{
    children?:any;
    elemRef?:(elem:HTMLElement|null)=>void;
    style?:CSSProperties;
    roleNone?:boolean;
    role?:string;
}

export function View({
    children,
    elem='div',
    elemRef,
    style,
    roleNone,
    role=roleNone?'none':undefined,
    ...props
}:ViewProps & {elem?:string}){

    return React.createElement(elem,{ref:elemRef,role,style,className:baseLayoutCn(props)},children);

}
