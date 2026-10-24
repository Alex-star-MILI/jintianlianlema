import { copyFileSync } from 'node:fs'

copyFileSync('dist/index.html', 'dist/404.html')
console.log('已生成 dist/404.html（GitHub Pages 单页路由回退）')
