// 所有插件通过 window.PetPlugins.push(...) 注册自己
// 一个插件是一个对象: { id, init(api), onClick(api)?, tick(api)? }
window.PetPlugins = window.PetPlugins || [];
