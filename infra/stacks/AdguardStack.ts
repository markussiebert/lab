import { Construct } from 'constructs';
import {
  RemoteBackendStackProps,
  RemoteBackendStack,
} from '../constructs/CustomStack';
import * as adguard from '../.gen/providers/adguard';
import { Lazy } from 'cdktf';

export interface AdguardStackProps extends RemoteBackendStackProps {}

export class AdguardStack extends RemoteBackendStack {

  readonly rules: string[] = [];

  constructor(scope: Construct, name: string, props: AdguardStackProps) {
    super(scope, name, props);

    new adguard.provider.AdguardProvider(this, 'Adguard', {
        host: 'adguard.familie-siebert.de',
        username: this.getSopsSecretValue('provider.adguard.username'),
        password: this.getSopsSecretValue('provider.adguard.password'),
    });

    new adguard.userRules.UserRules(this, 'AdguardUserRules',{
        rules: Lazy.listValue({
            produce: () => {
                return this.rules;
            }
        })
    });
  }

  public addRule(...rule: string[]) {
    rule.forEach((r) => this.rules.push(r));
  }
}