//build program like a plugin
import { join } from "node:path";
const fileNames = ["guardian"]
const files = fileNames.map(file => join(import.meta.dir, `./server-plugin/${file}.ts`));
//const web = join(import.meta.dir, "./web/index.html");
async function build() {
  const result = await Bun.build({
    entrypoints: [...files],
    outdir: './dist/server-plugin',
    target: 'bun',
    naming: {
      asset: "[dir]/[name].[ext]",
      chunk: "[dir]/[name].[ext]",
      entry: "[dir]/[name].[ext]",
    },
  });
  return result;
}
build().then(result => {
  console.log(result);
});
