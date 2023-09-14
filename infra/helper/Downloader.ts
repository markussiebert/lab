import * as https from 'https';
import * as fs from 'fs';

export function download(filename:string, url:string) {
    const dir = filename.split('/').slice(0,-1).join('/');
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
    const file = fs.createWriteStream(filename);
    https.get(url, function(response) {
        response.pipe(file);
        file.on("finish", () => {
            file.close();
            console.log("Download Completed");
        });
    });
}