
import { aiCompleteConvoModule } from "@iyio/ai-complete";
//import { aiCompleteLambdaModule } from "@iyio/ai-complete-lambda";
import { openAiModule } from "@iyio/ai-complete-openai";
import { EnvParams, ScopeRegistration, delayAsync, getErrorMessage, initRootScope, parseCliArgsT, rootScope } from "@iyio/common";
import { realpath, writeFile } from "fs/promises";
import { join } from "path";
import { ConvoWebCrawler } from "../lib/ConvoWebCrawler";
import { writeConvoCrawlerPreviewAsync } from "../lib/convo-web-crawler-output-previewer-writer";
import { ConvoWebSearchResult } from "../lib/convo-web-crawler-types";
import { defaultConvoCrawlerWebServerPort, runConvoCrawlerWebServer } from "../lib/convo-web-crawler-webserver";
import { doConvoCrawlerDevStuffAsync } from "../tmp/tmp-dev";
import { loadTmpEnv } from "../tmp/tmp-env";
import { startTmpTunnelAsync, stopTmpTunnelAsync } from "../tmp/tmp-ngrok";



interface Args
{
    /**
     * Scrapes a url
     */
    url?:string;

    /**
     * Preforms a google search and scrapes top search result
     */
    search?:string;

    pageRequirement?:string;

    researchTitle?:string;

    researchSubject?:string[];

    researchConclusion?:string;

    autoTunnel:boolean;

    dev?:boolean;

    debug?:boolean;

    writePreviewer?:string;

    serve?:boolean|number;

    browserConnectWsUrl?:string;

    chromeBinPath?:string;

    chromeDataDir?:string;

    useChrome?:boolean;

    openChrome?:boolean;
}

const args=parseCliArgsT<Args>({
    args:process.argv,
    startIndex:2,
    converter:{
        url:args=>args[0],
        search:args=>args[0],
        writePreviewer:args=>args[0],
        pageRequirement:args=>args[0],
        researchTitle:args=>args[0],
        researchSubject:args=>args,
        researchConclusion:args=>args[0],
        autoTunnel:args=>args.length?true:false,
        openChrome:args=>args.length?true:false,
        useChrome:args=>args.length?true:false,
        dev:args=>args.length?true:false,
        debug:args=>args.length?true:false,
        serve:args=>{
            const p=Number(args[0]);
            return isFinite(p)?p:true;
        },
        browserConnectWsUrl:args=>args[0],
        chromeBinPath:args=>args[0],
        chromeDataDir:args=>args[0],
    }
}).parsed as Args

loadTmpEnv();

const main=async ()=>{

    let exitCode=0;

    initRootScope((reg:ScopeRegistration)=>{
        reg.addParams(new EnvParams())
        //reg.use(aiCompleteLambdaModule);
        reg.use(openAiModule);
        reg.use(aiCompleteConvoModule);
    });

    await rootScope.getInitPromise();

    let httpAccessPoint:string|undefined;
    if(args.autoTunnel && !args.openChrome){
        httpAccessPoint=await startTmpTunnelAsync(
            args.serve===true?defaultConvoCrawlerWebServerPort:
            args.serve===false?undefined:args.serve);
        if(httpAccessPoint.endsWith('/')){
            httpAccessPoint=httpAccessPoint.substring(0,httpAccessPoint.length-1);
        }
        console.info(`Tunnel URL ${httpAccessPoint}`)
    }

    const crawler=new ConvoWebCrawler({
        googleSearchApiKey:process.env['NX_GOOGLE_SEARCH_API_KEY'],
        googleSearchCx:process.env['NX_GOOGLE_SEARCH_CX'],
        headed:true,
        httpAccessPoint,
        debug:args.debug,
        browserConnectWsUrl:args.browserConnectWsUrl,
        chromeBinPath:args.chromeBinPath,
        chromeDataDir:args.chromeDataDir,
        useChrome:args.useChrome||args.openChrome,
    });

    if(args.openChrome){
        const browser=await crawler.getBrowserAsync();
        await browser.newPage();
        process.exit(0);
        return;
    }

    try{

        let done=false;

        if(args.dev){
            done=true;
            await doConvoCrawlerDevStuffAsync(crawler);
        }

        if(args.serve){

            runConvoCrawlerWebServer({
                port:(typeof args.serve==='number')?args.serve:undefined,
                displayUrl:httpAccessPoint
            });

            while(true){
                await delayAsync(60000);
            }
            return;
        }

        if(args.writePreviewer){
            const html=await writeConvoCrawlerPreviewAsync(args.writePreviewer);
            const outPath=join(args.writePreviewer,'index.html');
            await writeFile(outPath,html);
            console.info(`index written to ${outPath}`);
            return;
        }

        if(args.url){
            await crawler.convertPageAsync({url:args.url});
            done=true;
        }

        let searchResults:ConvoWebSearchResult|undefined;

        if(args.search){
            searchResults=await crawler.searchAsync({
                term:args.search,
                crawlOptions:{
                    pageRequirementPrompt:args.pageRequirement
                }
            })
            done=true;
        }

        if(args.researchTitle || args.researchConclusion || args.researchSubject){
            if(!searchResults){
                console.error('--search required');
                exitCode=1;
                return;
            }

            if(!args.researchTitle){
                console.error('--researchTitle required');
                exitCode=1;
                return;
            }

            if(!args.researchConclusion){
                console.error('--researchConclusion required');
                exitCode=1;
                return;
            }

            if(!args.researchSubject){
                console.error('--researchSubject required');
                exitCode=1;
                return;
            }

            await crawler.runResearchAsync({
                title:args.researchTitle,
                subjects:args.researchSubject,
                conclusion:args.researchConclusion,
                searchResults,
            });
            done=true;
        }

        if(done){
            const outPath=await crawler.writeOutputAsync();
            console.info(`Output written to ${await realpath(outPath)}`);
        }else{
            console.info(`Usage:
--url                  url             scrape a URL
--search               term            preforms a search and scrapes the top results
--pageRequirement      prompt          A prompt that is used to check if a page should be scraped
--researchTitle        title           Title for research document
--researchSubject      subject         A subject that should be searched. Multiple subjects can be researched by supplying multiple --researchSubject arguments
--researchConclusion   conclusion      The conclusion that should be derived from research
--autoTunnel                           Opens a temporary Ngrok tunnel for relaying images to external LLMs
--serve                [ port = 8899 ] Starts a webserver that allows you to browse outputs
--browserConnectWsUrl  url             A Chrome remote debugger URL
--chromeBinPath        path            Custom path to a chrome binary
--chromeDataDir        path            Path to a directory to start chrome user profile data
--useChrome                            Auto launches and uses a standard chrome instance with a stable user profile
--openChrome                           Opens an instance of Chrome that can be used to sign-in or do other browser related tasks before scraping
--debug                                Print debug information


Scrape a single URL:
convo-web --url https://example.com


Search for a web pages about going fast:
convo-web --search 'go fast turn left' --pageRequirement 'The page should be related to driving fast'


Research Nuclear fusion reactors
convo-web \\
    --search 'Nuclear fusion reactors' \\
    --pageRequirement 'The page should contain information about Nuclear fusion reactor that are currently under development or operating' \\
    --researchTitle 'The power of a star' \\
    --researchSubject 'Operating reactors' \\
    --researchSubject 'Reactors under development' \\
    --researchSubject 'Net gain' \\
    --researchConclusion 'How long will it take until we have net energy gains'

Start a web server with a tunnel that allows you to browse outputs
convo web --serve --autoTunnel

`)
        }

    }catch(ex){
        console.error('Crawler failed')
        console.error(getErrorMessage(ex));
        console.error('stack',(ex as any)?.stack);
        throw ex;
    }finally{
        if(args.autoTunnel){
            await stopTmpTunnelAsync();
        }
        process.exit(exitCode);
    }


}

main();

