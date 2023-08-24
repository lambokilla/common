import { Observable, Subject } from 'rxjs';
import { objWatchEvtToRecursiveObjWatchEvt, wAryMove, wArySpliceWithSource, wDeleteProp, wSetProp, wTriggerChange, wTriggerEvent, wTriggerLoad } from './obj-watch-lib';
import { ObjWatchEvt, RecursiveObjWatchEvt } from "./obj-watch-types";
import { getValueByAryPath } from './object';

export class ObjMirror{

    private readonly _onOutOfSync=new Subject<RecursiveObjWatchEvt<any>>();
    public get onOutOfSync():Observable<RecursiveObjWatchEvt<any>>{return this._onOutOfSync}


    public readonly obj:any;

    public constructor(obj:any)
    {
        this.obj=obj;
    }


    public readonly recursiveCallback=(obj:any,evt:ObjWatchEvt<any>,path?:(string|number|null)[])=>{
        this.handleEvent(objWatchEvtToRecursiveObjWatchEvt(evt,path));
    }

    public handleEvent(evt:RecursiveObjWatchEvt<any>,source?:any)
    {
        let obj=this.obj;

        if(evt.path){
            obj=getValueByAryPath(obj,evt.path);
        }

        if(obj===undefined){
            return;
        }

        switch(evt.type){

            case 'set':
                wSetProp(obj,evt.prop,evt.value,source);
                break;

            case 'delete':
                wDeleteProp(obj,evt.prop,source);
                break;

            case 'aryChange':
                if(evt.values){
                    wArySpliceWithSource(source,obj,evt.index,evt.deleteCount??0,evt.values);
                }else{
                    wArySpliceWithSource(source,obj,evt.index,evt.deleteCount??0,[]);
                }
                break;

            case 'aryMove':
                wAryMove(obj,evt.fromIndex,evt.toIndex,evt.count,source);
                break;

            case 'change':
                wTriggerChange(obj,source);
                break;

            case 'load':
                wTriggerLoad(obj,evt.prop,source);
                break;

            case 'event':
                wTriggerEvent(obj,evt.eventType,evt.eventValue,source);
                break;
        }
    }



    private _isDisposed=false;
    public get isDisposed(){return this._isDisposed}
    public dispose()
    {
        if(this._isDisposed){
            return;
        }
        this._isDisposed=true;
    }
}