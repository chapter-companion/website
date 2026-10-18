import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=resolve(process.argv[2] ?? resolve(root,'../../bni-roster/bni_roster_app/assets'));
const output=resolve(root,'dist/planner-assets');
await mkdir(output,{recursive:true});
const files=[...Array.from({length:7},(_,i)=>[`pdf/one_to_one_template_page-${i+1}.png`,`template-${i+1}.png`]),['fonts/Roboto-Regular.ttf','Roboto-Regular.ttf']];
const manifest={};
for(const [input,name] of files){
  const path=resolve(source,input);
  const bytes=await readFile(path);
  await copyFile(path,resolve(output,name));
  manifest[name]=createHash('sha256').update(bytes).digest('hex');
}
await writeFile(resolve(root,'config/planner-template-assets.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Synchronized seven PDF template pages and the PDF font.');
