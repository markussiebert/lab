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

        const unifiNetworkBase = new unifi.dataUnifiNetwork.DataUnifiNetwork(this, 'UnifiNetworkBase', {
            name: 'ZuHause',
        });

        const unifiNetworkHomelab = new unifi.network.Network(this, 'UnifiNetworkLab', {
            name: 'Homelab',
            purpose: 'corporate',
            vlanId: 100,
            dhcpEnabled: true,
            dhcpStart: '192.168.100.100',
            dhcpStop: '192.168.100.200',
            dhcpdBootEnabled: true,
            dhcpdBootServer: '192.168.100.100',
            dhcpdBootFilename: 'undionly.kpxe',
            internetAccessEnabled: true,
            subnet: '192.168.100.1/24',
        })

        new unifi.portProfile.PortProfile(this, 'UnifiPortProfileLab', {
            autoneg: true,
            name: 'ZuHause (Homelab allowed)',
            nativeNetworkconfId: unifiNetworkBase.id,
            taggedNetworkconfIds: [
                unifiNetworkHomelab.id,
            ],
            poeMode: 'auto',
        })
    }
}