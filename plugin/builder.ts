import { join } from "node:path";
//"shared.ts" is a dependency for both "savedata.ts" and "tts.ts"
const fileNames = ["backup", "api", "console","terminal","tunnel"]
const files = fileNames.map(file => join(import.meta.dir, `${file}.ts`));
async function build() {
    const result = await Bun.build({
      entrypoints: files,
      outdir: './dist-plugins',
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
