import { Construct } from 'constructs';

export class MacAddress extends Construct {

  public readonly address: string;
  
  constructor(scope: Construct, name: string) {
    super(scope, name);

    this.address = MacAddress.generateMac(name);
  }

  /**
   * Generate a Mac ID base on a string, using a local only prefix (xA:xx)
   * 
   * Based on brycs answer 
   * on https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
   */
  static generateMac(input: string): string {


    for( var i=0,h=9;i<input.length;) {
        h=Math.imul(h^input.charCodeAt(i++),9**9);
    }
    
    return `aaaa${ ((h^h>>>9) < 0 ? (h^h>>>9) * -1 : (h^h>>>9)).toString(16) }aaaa`.substring(0,12).toUpperCase().match(/.{1,2}/g)!.join(':');
  }
}
