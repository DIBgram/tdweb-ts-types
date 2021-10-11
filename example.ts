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