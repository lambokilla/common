import { isDomNodeDescendantOf } from "@iyio/common";
import { RTxtAlignment, RTxtDescriptor, RTxtDoc, RTxtDocAndLookup, RTxtDomSelection, RTxtLine, RTxtNode, RTxtSelection, defaultRTxtNodeType, rTxtAttPrefix, rTxtIndexLookupAtt, rTxtLineAlignAtt, rTxtLineIndexAtt, rTxtTypeAtt } from "./rtxt-types";

export const getRTxtSelection=(
    domSelection:RTxtDomSelection,
    lookup:RTxtNode[],
    rootElem?:HTMLElement|null
):RTxtSelection|null=>{

    if(!domSelection.anchorNode || !domSelection.focusNode){
        return null;
    }

    let startNode=findRTxtNode(domSelection.anchorNode,lookup,rootElem);
    if(!startNode){
        return null;
    }

    let endNode=findRTxtNode(domSelection.focusNode,lookup,rootElem);
    if(!endNode){
        return null;
    }

    let startIndex=lookup.indexOf(startNode);
    let endIndex=lookup.indexOf(endNode);
    let startOffset=domSelection.anchorOffset;
    let endOffset=domSelection.focusOffset;

    const cursorIndex=endIndex;

    if(startIndex>endIndex || (startIndex===endIndex && startOffset>endOffset)){

        let tmpN=endIndex;
        endIndex=startIndex;
        startIndex=tmpN;

        tmpN=endOffset;
        endOffset=startOffset;
        startOffset=tmpN;

        const tmpNode=endNode;
        endNode=startNode;
        startNode=tmpNode;
    }

    const nodes:RTxtNode[]=lookup.slice(startIndex,endIndex+1);


    return {
        nodes,
        startNode,
        startIndex,
        startOffset,
        endNode,
        endIndex,
        endOffset,
        cursorIndex,
        cursorNode:lookup[cursorIndex],
    }
}

export const selectRTxtSelection=(selection:RTxtSelection,docElem:Element):boolean=>{

    const startElem=docElem.querySelector(`[${rTxtIndexLookupAtt}='${selection.startIndex}']`);

    if(!startElem){
        return false;
    }

    const endElem=docElem.querySelector(`[${rTxtIndexLookupAtt}='${selection.endIndex}']`)??startElem;

    const sel=globalThis.window?.getSelection();
    if(!sel){
        return false;
    }

    sel.removeAllRanges();
    const range=new Range();
    range.setStart(startElem,selection.startOffset);
    range.setEnd(endElem,selection.endOffset);
    sel.addRange(range);
    return true;
}

export const findRTxtNode=(
    domNode:Node,
    lookup:RTxtNode[],
    rootElem?:HTMLElement|null
):RTxtNode|null=>{

    let dn:Node|null=domNode;

    if(dn.nodeType===Node.TEXT_NODE){
        dn=domNode.parentNode;
    }

    while(dn){
        if((dn instanceof HTMLElement) && (rootElem?isDomNodeDescendantOf(dn,rootElem,true):true)){
            const index=dn.getAttribute(rTxtIndexLookupAtt);
            if(index){
                return lookup[Number(index)]??null;
            }
        }

        dn=dn.parentNode;
    }

    return null;
}

export const rTxtSelectionToString=(selection:RTxtSelection,lookup:RTxtNode[]):string=>{

    if(selection.startIndex===selection.endIndex){
        if(typeof selection.startNode.v !== 'string'){
            return '';
        }
        return selection.startNode.v.substring(selection.startOffset,selection.endOffset);
    }

    const buffer:string[]=[];
    for(let i=selection.startIndex;i<=selection.endIndex;i++){
        const node=lookup[i];
        if(typeof node?.v !== 'string'){
            continue;
        }
        if(i===selection.startIndex){
            buffer.push(node.v.substring(selection.startOffset));
        }else if(i===selection.endIndex){
            buffer.push(node.v.substring(0,selection.endOffset))
        }else{
            buffer.push(node.v);
        }
    }

    return buffer.join('');
}

/**
 * Converts each character in the doc into it's own node. This is used when when in editing mode.
 * @returns true if the doc was modified
 */
export const convertRTxtDocToSingleCharNodes=(doc:RTxtDoc):boolean=>{
    let changed=false;
    for(let i=0;i<doc.lines.length;i++){
        let line=doc.lines[i];
        if(!line){
            continue;
        }
        if(Array.isArray(line)){
            line={nodes:line}
            doc.lines[i]=line;
        }
        const nodes=line.nodes;
        for(let i=0;i<nodes.length;i++){
            const node=nodes[i];
            if(!node?.v || (node.v?.length??0)<=1){
                continue;
            }
            changed=true;
            nodes.splice(i,1);
            for(const char of node.v){
                nodes.splice(i,0,{...node,v:char});
                i++;
            }
            i--;

        }
    }
    return changed;
}

export const sortRTxtNodeTypes=(node:RTxtNode,descriptors:Record<string,RTxtDescriptor>):void=>{
    if(!node.t || (typeof node.t === 'string')){
        return;
    }

    node.t.sort((a,b)=>(descriptors[a]?.priority??0)-(descriptors[b]?.priority??0));
}


export const reIndexRTxtDocElem=(docElem:Element):void=>{
    let lineIndex=0;
    let nodeIndex=0;
    for(let i=0;i<docElem.children.length;i++){
        const lineElem=docElem.children.item(i);
        if(!lineElem){
            continue;
        }

        const lineIndexAtt=lineElem.getAttribute(rTxtLineIndexAtt);
        if(!lineIndexAtt){
            continue;
        }

        lineElem.setAttribute(rTxtLineIndexAtt,lineIndex.toString());

        for(let li=0;li<lineElem.children.length;li++){
            const elem=lineElem.children.item(li);
            if(!elem){
                continue;
            }

            const nodeIndexAtt=elem.getAttribute(rTxtIndexLookupAtt);

            if(!nodeIndexAtt){
                continue;
            }

            setAttRecursive(elem,rTxtIndexLookupAtt,nodeIndex.toString());

            nodeIndex++;

        }

        lineIndex++;

    }
}

const setAttRecursive=(elem:Element,att:string,value:string):void=>{
    elem.setAttribute(att,value);
    for(let i=0;i<elem.children.length;i++){
        const child=elem.children[i];
        if(!child){
            continue;
        }
        setAttRecursive(child,att,value);
    }
}

export const elemToRTxtDoc=(docElem:Element):RTxtDocAndLookup=>{

    const doc:RTxtDoc={lines:[]}
    const lookup:RTxtNode[]=[];

    for(let i=0;i<docElem.children.length;i++){
        const lineElem=docElem.children.item(i);
        if(!lineElem){
            continue;
        }

        const lineAtt=lineElem.getAttribute(rTxtLineIndexAtt);
        const children=lineAtt?lineElem.children:[lineElem];

        const alignAtt=lineElem.getAttribute(rTxtLineAlignAtt);
        const align=(alignAtt as RTxtAlignment|undefined)??((lineElem instanceof HTMLElement)?textAlignToRTxtAlignment(lineElem.style.textAlign):undefined);
        const line:RTxtLine={nodes:[]};
        if(align!=='start'){
            line.align=align;
        }
        doc.lines.push(line);

        for(let ni=0;ni<children.length;ni++){
            const nodeElem=children[ni];
            if(!nodeElem){
                continue;
            }

            const node=elemToRTxtNode(nodeElem);
            if(node){
                line.nodes.push(node);
                lookup.push(node);
            }

        }
    }

    return {doc,lookup};
}

export const textAlignToRTxtAlignment=(align:string|null|undefined):RTxtAlignment|undefined=>{
    if(!align){
        return undefined;
    }
    switch(align){
        case 'left':return 'start';
        case 'center':return 'center';
        case 'right':return 'end';
        default: return undefined;
    }
}

export const elemToRTxtNode=(nodeElem:Element):RTxtNode|null=>{

    const value=nodeElem.textContent;
    if(!value){
        return null;
    }

    const type=nodeElem.getAttribute(rTxtTypeAtt);

    let atts:Record<string,string>|undefined=undefined;

    for(let i=0;i<nodeElem.attributes.length;i++){
        const att=nodeElem.attributes.item(i);
        if(!att || !att.name.startsWith(rTxtAttPrefix)){
            continue;
        }
        if(!atts){
            atts={}
        }
        atts[att.value.substring(rTxtAttPrefix.length)]=att.value;
    }

    const t=type?(type.includes(',')?type.split(','):type):undefined;

    const node:RTxtNode={v:value};

    if(t && t!==defaultRTxtNodeType){
        node.t=t;
    }
    if(atts){
        node.atts=atts;
    }

    return node;
}

export const getRTxtNodeTypes=(nodes:RTxtNode[]|null|undefined):string[]=>{
    const types:string[]=[];
    if(!nodes){
        return types;
    }

    for(const node of nodes){
        if(!node.t){
            continue;
        }
        if(typeof node.t === 'string'){
            if(!types.includes(node.t)){
                types.push(node.t);
            }
        }else{
            for(const type of node.t){
                if(!types.includes(type)){
                    types.push(type);
                }
            }
        }
    }

    return types;
}

export const getRTxtLineNodes=(lineOrNodes:RTxtLine|RTxtNode[]):RTxtNode[]=>{
    if(Array.isArray(lineOrNodes)){
        return lineOrNodes;
    }else{
        return lineOrNodes.nodes??[];
    }
}

export const getRTxtNodeLine=(doc:RTxtDoc,node:RTxtNode):RTxtLine|undefined=>{
    const line=doc.lines.find(l=>Array.isArray(l)?false:l.nodes.includes(node));
    return line as RTxtLine|undefined;
}


export const getRTxtNodesLines=(doc:RTxtDoc,nodes:RTxtNode[]):RTxtLine[]=>{
    const lines:RTxtLine[]=[];
    for(const node of nodes){
        const line=getRTxtNodeLine(doc,node);
        if(line && !lines.includes(line)){
            lines.push(line);
        }
    }
    return lines;
}