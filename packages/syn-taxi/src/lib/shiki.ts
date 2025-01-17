
import { createBase64DataUrl } from '@iyio/common';
import { useEffect, useState } from 'react';
import { BUNDLED_LANGUAGES, Highlighter, Lang, getHighlighter } from 'shiki';

let defaultHighlighter:Promise<Highlighter>|null;

const loadLangMap:Record<string,Promise<void>>={};

export const loadShikiLangAsync=(name:string)=>{
    return loadLangMap[name]??(loadLangMap[name]=_loadShikiLangAsync(name));
}

const _loadShikiLangAsync=async (name:string,scope=`source.${name}`)=>{

    const sh=await getShikiAsync();

    if(sh.getLoadedLanguages().includes(name as Lang)){
        return;
    }

    if(BUNDLED_LANGUAGES.some(l=>l.id===name)){
        await sh.loadLanguage(name as Lang);
    }else{

        await sh.loadLanguage({
            id:name,
            scopeName:scope,
            displayName:name,
            path:name==='convo'?createBase64DataUrl(JSON.stringify(convo),'application/json'):`highlighting/languages/${name}.tmLanguage.json`,

        })
    }
}

export const getShikiAsync=():Promise<Highlighter>=>{
    if(!defaultHighlighter){
        defaultHighlighter=getHighlighter({
            theme:'dark-plus',
            langs:[],
            paths:{
                themes:'/highlighting/themes',
                languages:'/highlighting/languages',
                wasm:'/highlighting'
            }
        });
    }
    return defaultHighlighter;
}

export const useShiki=(language?:string)=>{

    const [sh,setSh]=useState<Highlighter|null>(null);

    const [langSh,setLangSh]=useState<Highlighter|null>(null);


    useEffect(()=>{
        let m=true;

        getShikiAsync().then(v=>{
            if(m){
                setSh(v);
            }
        })
        return ()=>{
            m=false;
        }
    },[]);

    useEffect(()=>{
        setLangSh(null);
        if(!sh || !language){
            return;
        }

        let m=true;

        loadShikiLangAsync(language).then(()=>{
            if(m){
                setLangSh(sh);
            }
        })

        return ()=>{
            m=false;
        }

    },[language,sh]);

    return language?langSh:sh;
}

const convo={
    "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
    "name":"convo",
    "scopeName": "source.convo",
    "uuid": "B7A8C571-820A-4958-A997-76DFD822B0FE",
    "fileTypes": ["convo"],
    "patterns": [
        { "include": "#expression" }
    ],
    "repository": {

        "expression": {
            "patterns": [
                { "include": "#interpolation"},
                { "include": "#topLevelStatements"},
                { "include": "#function"},
                { "include": "#role" },
                { "include": "#functionBody"},
                { "include": "#msgStringStartMsg"},
                { "include": "#msgStringBackslash"},
                { "include": "#embedEscape" },
                { "include": "#embed" },
                { "include": "#markdownImage" },
                { "include": "#comment" },
                { "include": "#tag" }
            ]
        },
        "interpolation":{
            "contentName": "meta.embedded.line.ts",
            "begin": "\\${",
            "beginCaptures": {
                "0": {
                    "name": "punctuation.definition.interpolation.begin.bracket.curly.scss punctuation.definition.template-expression.begin.js"
                }
            },
            "end": "}",
            "endCaptures": {
                "0": {
                    "name": "punctuation.definition.interpolation.end.bracket.curly.scss punctuation.definition.template-expression.end.js"
                }
            },
            "name": "variable.interpolation.scss",
            "patterns": [
                {
                    "include": "source.ts#expression"
                },
                {
                    "include": "#interpolation"
                }
            ]
        },
        "role": {
            "match": "^\\s*(>)\\s*(\\w+)\\s*([\\*\\?!]*)",
            "captures": {
                "1":{
                    "name":"keyword.control"
                },
                "2":{
                    "name":"storage.modifier"
                },
                "3":{
                    "name":"entity.name.type"
                }
            }
        },
        "embedEscape":{
            "match":"(\\\\){\\{",
            "captures": {
                "1":{
                    "name":"constant.character.escape"
                }
            }
        },
        "embed":{
            "begin":"\\{\\{",
            "end":"\\}\\}",
            "beginCaptures": {
                "0":{
                    "name":"entity.name.tag"
                }
            },
            "endCaptures": {
                "0":{
                    "name":"entity.name.tag"
                }
            },
            "patterns":[{"include":"#lineExpression"}]
        },
        "topLevelStatements":{
            "begin": "^\\s*(>)\\s*(do|result|define|debug|end)",
            "end": "(?=\\s*>)",
            "beginCaptures": {
                "1":{
                    "name":"keyword.control"
                },
                "2":{
                    "name":"keyword.control"
                }
            },
            "patterns": [
                {"include":"#comment"},
                {"include":"#tag"},
                {"include":"#functionCall"},
                {"include":"#paramLineExpression"}
            ]
        },
        "function":{
            "begin": "^\\s*(>)\\s*(\\w+)?\\s+(\\w+)\\s*([\\*\\?!]*)\\s*(\\()",
            "end": "\\)",
            "beginCaptures": {
                "1":{
                    "name":"keyword.control"
                },
                "2":{
                    "name":"storage.modifier"
                },
                "3":{
                    "name":"support.function"
                },
                "4":{
                    "name":"entity.name.type"
                },
                "5":{
                    "name":"keyword.control"
                }
            },
            "endCaptures": {
                "0":{
                    "name":"keyword.control"
                }
            },
            "patterns": [
                {"include":"#comment"},
                {"include":"#tag"},
                {"include":"#functionCall"},
                {"include":"#paramLineExpression"}
            ]
        },
        "functionBody":{
            "begin":"(\\w+)?\\s*(->)\\s*(\\w+)?\\s*(\\()",
            "end":"\\)",
            "beginCaptures": {
                "1":{
                    "name":"entity.name.type"
                },
                "2":{
                    "name":"keyword.operator"
                },
                "3":{
                    "name":"entity.name.type"
                },
                "4":{
                    "name":"keyword.control"
                }
            },
            "endCaptures": {
                "0":{
                    "name":"keyword.control"
                }
            },
            "patterns": [
                {"include":"#comment"},
                {"include":"#tag"},
                {"include":"#functionCall"},
                {"include":"#lineExpression"}
            ]
        },
        "functionCall":{
            "begin":"(\\w+)\\s*(\\()",
            "end":"\\)",
            "beginCaptures": {
                "1":{
                    "name":"support.function",
                    "patterns":[
                        {"include":"#operators"},
                        {"include":"#typeFunctions"},
                        {"include":"#logicOperators"},
                        {"include":"#systemFunctions"}
                    ]
                },
                "2":{
                    "name":"meta.parameters"
                }
            },
            "endCaptures":{
                "0":{
                    "name":"meta.parameters"
                }
            },
            "patterns": [
                { "include": "#lineExpression" }
            ]
        },
        "comment":{
            "patterns":[
                {
                    "match":"#.*",
                    "name":"comment"
                },
                {
                    "match":"//.*",
                    "name":"emphasis",
                    "captures":{
                        "0":{"name":"comment"}
                    }
                }
            ]
        },
        "tag":{
            "match":"(@)\\s*(\\w*)\\s*=?(.*)",
            "captures":{
                "1":{
                    "name":"entity.name.tag"
                },
                "2":{
                    "name":"entity.name.tag"
                },
                "3":{
                    "name":"string"
                }
            }
        },
        "lineExpression":{
            "patterns":[
                {"include":"#comment"},
                {"include":"#tag"},
                {"include":"#heredoc"},
                {"include":"#stringDq"},
                {"include":"#stringSq"},
                {"include":"#pipe"},
                {"include":"#functionCall"},
                {"include":"#label"},
                {"include":"#typeKeyword"},
                {"include":"#number"},
                {"include":"#constValue"},
                {"include":"#userDefinedType"},
                {"include":"#lineVar"}
            ]
        },
        "paramLineExpression":{
            "patterns":[
                {"include":"#comment"},
                {"include":"#tag"},
                {"include":"#heredoc"},
                {"include":"#stringDq"},
                {"include":"#stringSq"},
                {"include":"#pipe"},
                {"include":"#functionCall"},
                {"include":"#paramLabel"},
                {"include":"#typeKeyword"},
                {"include":"#number"},
                {"include":"#constValue"},
                {"include":"#userDefinedType"},
                {"include":"#lineVar"}
            ]
        },
        "userDefinedType":{
            "match":"\\b[A-Z]\\w*\\b",
            "captures":{
                "0":{
                    "name":"entity.name.type"
                }
            }
        },
        "lineVar":{
            "match":"\\b\\w+\\b",
            "captures":{
                "0":{
                    "name":"variable"
                }
            }
        },
        "label":{
            "match":"(\\w+)\\s*(\\?)?\\s*:",
            "captures":{
                "1":{
                    "name":"entity.name"
                }
            }
        },
        "paramLabel":{
            "match":"(\\w+)\\s*(\\?)?\\s*:",
            "captures":{
                "1":{
                    "name":"variable"
                }
            }
        },
        "stringDq":{
            "begin":"\"",
            "end":"\"",
            "name":"string",
            "patterns":[
                {"include":"#stringBackslash"},
                {
                    "match":"(\\\\)(\")",
                    "captures":{
                        "1":{"name":"constant.character.escape"},
                        "2":{"name":"string"}
                    }
                }
            ]
        },
        "stringSq":{
            "begin":"'",
            "end":"'",
            "name":"string",
            "patterns":[
                {"include":"#stringBackslash"},
                {
                    "match":"(\\\\)(')",
                    "captures":{
                        "1":{"name":"constant.character.escape"},
                        "2":{"name":"string"}
                    }
                },
                {"include":"#embedEscape"},
                {"include":"#embed"}
            ]
        },
        "markdownImage":{
            "begin":"!\\[",
            "end":"(\\]\\()([^\\)]*)(\\))",
            "beginCaptures":{
                "0":{"name":"keyword.control"}
            },
            "endCaptures":{
                "1":{"name":"keyword.control"},
                "2":{"name":"string"},
                "3":{"name":"keyword.control"}
            },
            "contentName":"comment"
        },
        "stringBackslash":{
            "match":"(\\\\)\\\\",
            "captures":{
                "1":{"name":"constant.character.escape"}
            }
        },
        "msgStringBackslash":{
            "match":"(\\\\)\\\\(?=\\{\\{)",
            "captures":{
                "1":{"name":"constant.character.escape"}
            }
        },
        "msgStringStartMsg":{
            "match":"^[ \\t]*(\\\\)\\\\*>",
            "captures":{
                "1":{"name":"constant.character.escape"}
            }
        },
        "typeKeyword":{
            "match":"\\b(string|number|int|boolean|time|void|any|map|array)\\b",
            "captures":{
                "1":{
                    "name":"entity.name.type"
                }
            }
        },
        "systemFunctions":{
            "match":"\\b(elif|if|else|while|break|foreach|for|in|do|then|fn|return|case|default|switch|test)$",
            "captures":{
                "1":{
                    "name":"keyword.control"
                }
            }
        },
        "typeFunctions":{
            "match":"\\b(enum|struct|array)$",
            "captures":{
                "1":{
                    "name":"keyword.control"
                }
            }
        },
        "operators":{
            "match":"\\b(lt|lte|eq|gt|gte|is|add|sub|mul|div|not|mod|pow|inc|dec)$",
            "captures":{
                "1":{
                    "name":"keyword"
                }
            }
        },
        "logicOperators":{
            "match":"\\b(and|or)$",
            "captures":{
                "1":{
                    "name":"keyword"
                }
            }
        },
        "number":{
            "match":"-?(\\d+\\.\\d+|\\.\\d+|\\d+)+",
            "name":"entity.name.type"
        },
        "constValue":{
            "match":"\\b(true|false|null|undefined|convo|__args|__return|__error|__debug|__disableAutoComplete)\\b",
            "name":"constant.language"
        },
        "heredoc":{
            "begin":"-{3,}",
            "end":"-{3,}",
            "beginCaptures":{
                "0":{"name":"comment"}
            },
            "endCaptures":{
                "0":{"name":"comment"}
            },
            "patterns": [
                {"include":"#expression"}
            ]
        },
        "pipe":{
            "match":"<<",
            "name":"keyword.control"
        }
    }

}


