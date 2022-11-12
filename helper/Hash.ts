export function hash(input: string): string {


    for( var i=0,h=9;i<input.length;) {
        h=Math.imul(h^input.charCodeAt(i++),9**9);
    }
    
    return  ((h^h>>>9) < 0 ? (h^h>>>9) * -1 : (h^h>>>9)).toString(16);
  }