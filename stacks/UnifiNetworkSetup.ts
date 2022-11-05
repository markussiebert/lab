import { Construct } from 'constructs';
import * as unifi from '../.gen/providers/unifi';
import path = require('path');
import { RemoteBackendStack } from '../constructs/RemoteBackendStack';

export class UnifiNetworkSetup extends RemoteBackendStack {
    constructor(scope: Construct, name: string) {
        super(scope, name, {
            remoteBackend: 'markussiebert/lab-unifi',
            sopsSecretsFile: path.join(__dirname, '../secrets/secrets.sops.yaml'),
        });

        /**
         * Unifi Provider
         */

        new unifi.provider.UnifiProvider(this, 'UnifiProvider', {
            apiUrl: this.getSopsSecretValue('provider.unifi.url'),
            username: this.getSopsSecretValue('provider.unifi.username'),
            password: this.getSopsSecretValue('provider.unifi.password'),
        });

        new unifi.network.Network(this, 'UnifiNetworkLab', {
            name: 'lab',
            purpose: 'corporate',
            vlanId: 101,
            

        })
    }
}

  