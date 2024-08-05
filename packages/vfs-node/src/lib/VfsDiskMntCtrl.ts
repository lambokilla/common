import { NotFoundError, getContentType, getDirectoryName, getFileName, joinPaths } from "@iyio/common";
import { pathExistsAsync } from "@iyio/node-common";
import { VfsCtrl, VfsDirReadOptions, VfsDirReadResult, VfsItem, VfsItemGetOptions, VfsMntCtrl, VfsMntCtrlOptions, VfsMntPt, VfsReadStream, VfsReadStreamWrapper, createNotFoundVfsDirReadResult, defaultVfsIgnoreFiles, testVfsFilter, vfsMntTypes } from "@iyio/vfs";
import { Dirent, createReadStream, createWriteStream } from "fs";
import { appendFile, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "fs/promises";

export interface VfsDiskMntCtrlOptions extends VfsMntCtrlOptions
{
    ignoreFilenames?:string[];
}

/**
 * Mounts files stored on a hard drive
 */
export class VfsDiskMntCtrl extends VfsMntCtrl
{

    private readonly ignoreFilenames:string[];

    public constructor({
        ignoreFilenames=defaultVfsIgnoreFiles,
        ...options
    }:VfsDiskMntCtrlOptions={}){
        super({
            ...options,
            type:vfsMntTypes.file,
            removeProtocolFromSourceUrls:true,
        })
        this.ignoreFilenames=ignoreFilenames;

    }

    protected override _getItemAsync=async (fs:VfsCtrl,mnt:VfsMntPt,path:string,sourceUrl:string|undefined,options?:VfsItemGetOptions):Promise<VfsItem|undefined>=>
    {
        if(!sourceUrl){
            return undefined;
        }

        try{

            const s=await stat(sourceUrl);
            if(!s){
                return undefined;
            }

            const isDir=s.isDirectory();
            const name=getFileName(path);

            return {
                type:isDir?'dir':'file',
                path,
                name,
                size:isDir?undefined:s.size,
                contentType:isDir?getContentType(name):undefined,
            }

        }catch{
            return undefined;
        }
    }

    protected override _readDirAsync=async (fs:VfsCtrl,mnt:VfsMntPt,options:VfsDirReadOptions,sourceUrl:string|undefined):Promise<VfsDirReadResult>=>
    {
        if(!sourceUrl){
            return createNotFoundVfsDirReadResult(options);
        }

        try{
            const s=await stat(sourceUrl);
            if(!s?.isDirectory()){
                return createNotFoundVfsDirReadResult(options);
            }
        }catch{
            return createNotFoundVfsDirReadResult(options);
        }

        const dirItems=await readdir(sourceUrl,{withFileTypes:true});

        dirItems.sort((a,b)=>((a.isDirectory()?'a':'b')+a.name).localeCompare((b.isDirectory()?'a':'b')+b.name));

        const items:VfsItem[]=[];

        for(let i=options.offset??0;i<dirItems.length && items.length<(options.limit??dirItems.length);i++){
            const item=dirItems[i] as Dirent;
            if(this.ignoreFilenames.includes(item.name) || (options.filter && !testVfsFilter(item.name,options.filter))){
                continue;
            }
            const isDir=item.isDirectory();
            items.push({
                type:isDir?'dir':'file',
                path:joinPaths(options.path,item.name),
                name:getFileName(item.name),
                contentType:isDir?undefined:getContentType(item.name),
            })
        }

        return {
            items,
            offset:options.offset??0,
            count:items.length,
            total:dirItems.length,
            notFound:false,
        }

    }

    private async makeDirectoryForFileAsync(sourceUrl:string){
        const basePath=getDirectoryName(sourceUrl);
        if(!basePath || basePath===''){
            return;
        }
        if(!await pathExistsAsync(basePath)){
            await mkdir(basePath,{recursive:true})
        }
    }

    protected override _mkDirAsync=async (fs:VfsCtrl,mnt:VfsMntPt,path:string,sourceUrl:string|undefined):Promise<VfsItem>=>
    {
        if(!sourceUrl){
            throw new Error('sourceUrl required');
        }
        await mkdir(sourceUrl,{recursive:true});
        const item=await this._getItemAsync(fs,mnt,path,sourceUrl);
        if(!item){
            throw new Error('unable to get item info for new directory');
        }
        return item;
    }

    protected override _removeAsync=async (fs:VfsCtrl,mnt:VfsMntPt,path:string,sourceUrl:string|undefined):Promise<VfsItem>=>
    {
        if(!sourceUrl){
            throw new Error('sourceUrl required');
        }
        const item=await this._getItemAsync(fs,mnt,path,sourceUrl);
        if(!item){
            throw new NotFoundError();
        }
        if(item.type==='dir'){
            await rm(sourceUrl,{recursive:true,force:true});
        }else{
            await unlink(sourceUrl);
        }
        return item;
    }

    private _readAsync(sourceUrl:string|undefined):Promise<Buffer>
    {
        if(!sourceUrl){
            throw new Error('sourceUrl required');
        }
        return readFile(sourceUrl);
    }

    protected override _readStringAsync=async (fs:VfsCtrl,mnt:VfsMntPt,path:string,sourceUrl:string|undefined):Promise<string>=>
    {
        return (await this._readAsync(sourceUrl)).toString()
    }

    protected override _writeStringAsync=async (fs:VfsCtrl,mnt:VfsMntPt,path:string,sourceUrl:string|undefined,content:string):Promise<VfsItem>=>
    {
        if(!sourceUrl){
            throw new Error('sourceUrl required');
        }
        await this.makeDirectoryForFileAsync(sourceUrl);
        await writeFile(sourceUrl,content);
        const item=await this._getItemAsync(fs,mnt,path,sourceUrl);
        if(!item){
            throw new Error('Item to returned');
        }
        return item;
    }

    protected override _appendStringAsync=async (fs:VfsCtrl,mnt:VfsMntPt,path:string,sourceUrl:string|undefined,content:string):Promise<VfsItem>=>
    {
        if(!sourceUrl){
            throw new Error('sourceUrl required');
        }
        await this.makeDirectoryForFileAsync(sourceUrl);
        await appendFile(sourceUrl,content);
        const item=await this._getItemAsync(fs,mnt,path,sourceUrl);
        if(!item){
            throw new Error('Item to returned');
        }
        return item;
    }

    protected override _readBufferAsync=(fs:VfsCtrl,mnt:VfsMntPt,path:string,sourceUrl:string|undefined):Promise<Uint8Array>=>
    {
        return this._readAsync(sourceUrl);
    }

    protected override _writeBufferAsync=async (fs:VfsCtrl,mnt:VfsMntPt,path:string,sourceUrl:string|undefined,buffer:Uint8Array|Blob):Promise<VfsItem>=>
    {
        if(!sourceUrl){
            throw new Error('sourceUrl required');
        }
        await this.makeDirectoryForFileAsync(sourceUrl);
        await writeFile(sourceUrl,(buffer instanceof Blob)?new Uint8Array(await buffer.arrayBuffer()):buffer);
        const item=await this._getItemAsync(fs,mnt,path,sourceUrl);
        if(!item){
            throw new Error('Item to returned');
        }
        return item;
    }

    protected override _writeStreamAsync=async (fs:VfsCtrl,mnt:VfsMntPt,path:string,sourceUrl:string|undefined,stream:VfsReadStream):Promise<VfsItem>=>
    {
        if(!sourceUrl){
            throw new Error('sourceUrl required');
        }
        await this.makeDirectoryForFileAsync(sourceUrl);
        const writeStream=createWriteStream(sourceUrl);
        return await new Promise<VfsItem>((resolve,reject)=>{
            writeStream.on('open',()=>{
                stream.pipe(writeStream);
            })
            let error=false;
            writeStream.on('close',()=>{
                if(error){
                    return;
                }
                this._getItemAsync(fs,mnt,path,sourceUrl).then(item=>{
                    if(item){
                        resolve(item);
                    }else{
                        reject(new Error('Item to returned'))
                    }
                }).catch(err=>reject(err));
            })
            writeStream.on('error',err=>{
                error=true;
                reject(err);
            })
        })
    }

    protected override _getReadStream=(fs:VfsCtrl,mnt:VfsMntPt,path:string,sourceUrl:string|undefined):Promise<VfsReadStreamWrapper>=>
    {
        if(!sourceUrl){
            throw new Error('sourceUrl required');
        }
        return new Promise<VfsReadStreamWrapper>((resolve,reject)=>{
            stat(sourceUrl).then(s=>{
                try{
                    const fileStream=createReadStream(sourceUrl);
                    fileStream.on('open',()=>{
                        resolve({
                            stream:fileStream,
                            size:s.size,
                            contentType:getContentType(sourceUrl)
                        })
                    })
                    fileStream.on('error',err=>{
                        fileStream.destroy();
                    });
                    fileStream.on('end',()=>{
                        fileStream.destroy();
                    })
                }catch(ex){
                    reject(ex);
                }
            }).catch(err=>reject(err))
        })
    }
}
