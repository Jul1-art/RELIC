export const formatNumber=value=>new Intl.NumberFormat(globalThis.document?.documentElement.lang||'en').format(value);
export const t=(value,params={})=>value.replace(/\{([^}]+)\}/g,(_,key)=>params[key]??'');
