import TdApi from "./td_api";

// Hover over member functions to see their type definitions.
const query: TdApi.TdFunction = {
    "@type": "getChats",
    chat_list: {
        "@type": "chatListFilter",
        chat_filter_id: 0
    },
    limit: 50
}

function send<T extends TdApi.TdFunction>(query: T): Promise<TdApi.TdFunctionReturn<T>> {
    return new Promise((resolve, reject) => {
        resolve({} as TdApi.TdFunctionReturn<T>); //! This is a dummy function
    });
}

send(query).then(result => {
    console.log(`loaded ${result.total_count} chats`);
})

function on<T extends TdApi.td_Update>(type: TdApi.TdUpdateType<T>, callback: (update: T) => void): void {
    //! This is a dummy function
}

on<TdApi.td_updateNewChat>('updateNewChat', update => { // Unfortunately you need to specify both the generic type and the string type. It may be possible to infer the generic type from the string type, or the string type from the generic type.
    console.log(`new chat ${update.chat.id}`);
});
