import { DisposeCallback, getSubstringCount, Point, shortUuid } from "@iyio/common";
import { addMarkdownAttribute, addMarkdownHidden, applyMarkdownViewMode, getHiddenMarkdownCode, getMarkdownProtoPos, getProtoLayout, mergeMarkdownCode, parseMarkdownNodes, ProtoLayout, ProtoNode, ProtoPosScale, ProtoViewMode, setMarkdownProtoPos, splitMarkdownSections } from "@iyio/protogen";
import { BehaviorSubject, combineLatest } from "rxjs";
import { DomViewCharPointer, getElemProtoLayout, getNodesProtoLayout } from "./protogen-ui-lib";
import { ProtogenCtrl } from "./ProtogenCtrl";


export class NodeCtrl
{
    public readonly id:string;
    public readonly parent:ProtogenCtrl;
    public autoFocus:boolean=false;
    public autoFocusType:boolean=false;
    public readonly node:BehaviorSubject<ProtoNode>;
    public readonly nodeLayouts:BehaviorSubject<ProtoLayout[]>=new BehaviorSubject<ProtoLayout[]>([]);
    public readonly code:BehaviorSubject<string>;
    public readonly pos:BehaviorSubject<ProtoPosScale>;
    public readonly viewElem:BehaviorSubject<HTMLElement|null>=new BehaviorSubject<HTMLElement|null>(null);
    public readonly codeElem:BehaviorSubject<HTMLElement|null>=new BehaviorSubject<HTMLElement|null>(null);

    private codeChangeId=0;
    private codeBackup:string;
    private lastViewMode:ProtoViewMode='all';
    private lastLineCount=0;
    private removeResizeListener?:DisposeCallback;

    public constructor(code:string,parent:ProtogenCtrl)
    {
        this.codeBackup=code;
        const nodes=parseMarkdownNodes(code);
        this.id=shortUuid();
        this.parent=parent;
        this.node=new BehaviorSubject<ProtoNode>(nodes[0]??parseMarkdownNodes('## NewType')[0]);
        this.code=new BehaviorSubject(code);
        this.pos=new BehaviorSubject<ProtoPosScale>(getMarkdownProtoPos(code)??{x:0,y:0,scale:1});
        combineLatest([this.viewElem,this.pos]).subscribe(([elem,pos])=>{
            if(elem){
                elem.style.transform=`translate(${pos.x}px,${pos.y}px)`;
                elem.style.minWidth=pos.width===undefined?'auto':pos.width+'px';
            }
        })
        this.code.subscribe((code)=>{
            this.codeChangeId++;
            const lineCount=getSubstringCount(code,'\n');
            const lc=this.lastLineCount;
            this.lastLineCount=lineCount;
            this.update(true,lc!==lineCount?0:700);
        })
        this.codeElem.subscribe(this.updateBound);

        this.viewElem.subscribe(view=>{
            this.removeResizeListener?.();
            if(!view){
                return;
            }
            let width=-1;
            let height=-1;
            const ob=new ResizeObserver((e)=>{
                const w=Math.round(e[0]?.contentRect.width??0);
                const h=Math.round(e[0]?.contentRect.height??0);
                if(width===w && height===h){
                    return;
                }
                width=w;
                height=h;
                this.update(true,15);
            })

            ob.observe(view);

            this.removeResizeListener=()=>ob.disconnect();
        })

    }

    private _isDisposed=false;
    public get isDisposed(){return this._isDisposed}
    public dispose(){
        if(this._isDisposed){
            return;
        }
        this._isDisposed=true;
        this.removeResizeListener?.();
        this.parent.removeEntity(this);
    }

    public readonly setCodeBound=(code:string)=>this.code.next(code);
    public readonly updateBound=()=>this.update();

    _updateViewMode()
    {
        this.codeChangeId++;
        const fullCode=this.getFullCode(this.lastViewMode);
        const viewMode=this.parent.viewMode;

        const code=applyMarkdownViewMode(fullCode,viewMode);

        this.lastViewMode=viewMode;
        this.codeBackup=fullCode;
        this.code.next(code);
        this.update(false);
    }

    private _moveTo(point:Point){
        this.pos.next({...this.pos.value,...point});
    }

    public moveTo(point:Point){
        this._moveTo(point);
        this.update();
    }

    public updateCodeLayout(point?:Point){
        if(point){
            this._moveTo(point);
        }
        const code=this.getFullCode();
        const updated=setMarkdownProtoPos(code,this.pos.value);
        if(this.parent.viewMode==='all'){
            this.code.next(updated);
        }else{
            this.codeBackup=updated;
        }
        this.update();
    }

    public updateNodeLayouts()
    {
        const layouts:ProtoLayout[]=[];
        const rootLayout=getProtoLayout(this.node.value);
        if(rootLayout){
            layouts.push(rootLayout);
        }

        const children=this.node.value.children??[];
        for(const child of children){
            const layout=getProtoLayout(child);
            if(layout){
                layouts.push(layout);
            }
        }

        this.nodeLayouts.next(layouts)

    }

    private lastFullCode:string='';
    private lastFullCodeId=-2;

    public getFullCode(viewMode:ProtoViewMode=this.parent.viewMode):string{
        if(this.codeChangeId===this.lastFullCodeId){
            return this.lastFullCode;
        }
        const fullCode=mergeMarkdownCode(
            this.code.value,
            this.codeBackup,
            viewMode
        );
        this.lastFullCodeId=this.codeChangeId;
        this.lastFullCode=fullCode;
        return fullCode;
    }

    public setFullCode(code:string){
        if(this.parent.viewMode==='all'){
            this.code.next(code);
        }else{
            this.codeBackup=code;
            this.code.next(applyMarkdownViewMode(code,this.parent.viewMode));

        }
    }

    private updateId=0;
    public update(updateLines=true,delay=0){
        const codeElem=this.codeElem.value;
        if(!codeElem || this._isDisposed){
            return;
        }

        const updateId=++this.updateId;
        if(delay>0 || this.code.value.trim()!==codeElem.innerText.trim()){
            const iv=setInterval(()=>{
                if(this.updateId!==updateId || this._isDisposed){
                    clearInterval(iv);
                    return;
                }
                if(this.code.value.trim()===codeElem.innerText.trim()){
                    clearInterval(iv);
                    this.doUpdate(updateLines,codeElem);
                }
            },delay>0?delay:15);

        }else{
            this.doUpdate(updateLines,codeElem);
        }

    }

    private doUpdate(updateLines:boolean,codeElem:HTMLElement){

        if(!this.getFullCode().trim()){
            this.dispose();
            return;
        }

        const pointer=new DomViewCharPointer(codeElem);

        const code=this.code.value;
        const hiddenCode=getHiddenMarkdownCode(this.codeBackup,this.parent.viewMode);

        const nodes=parseMarkdownNodes(code,hiddenCode,pointer,views=>{
            return getNodesProtoLayout(
                views,
                this.parent.pos.value.scale
            );
        })
        if(!nodes.length){
            this.dispose();
            return;
        }

        this.node.next(nodes[0]);

        if(nodes.length>1){
            const sections=splitMarkdownSections(hiddenCode?addMarkdownHidden(code)+hiddenCode:code);

                this.code.next(sections[0]);
                const nodeLayout=getElemProtoLayout(this.viewElem.value,this.parent.pos.value.scale);
                for(let i=1;i<sections.length;i++){
                    this.parent.addEntity(
                        setMarkdownProtoPos(
                            sections[i].trim()+'\n',
                            {
                                x:nodeLayout.left,
                                y:nodeLayout.bottom+30,
                                scale:this.parent.pos.value.scale,
                                width:this.pos.value.width
                            }
                        ),
                        i===sections.length-1
                    );
                }
        }

        this.updateNodeLayouts();

        if(updateLines){
            this.parent.lineCtrl.updateLines(this.node.value.name);
        }

    }

    public addAttribute(childName:string,attName:string,value:string,hidden:boolean){
        const code=addMarkdownAttribute(
            this.getFullCode(),
            childName,
            attName,
            value,
            hidden
        )
        this.setFullCode(code);
    }

}
