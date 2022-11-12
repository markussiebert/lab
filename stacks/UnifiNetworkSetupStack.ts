import { Construct } from 'constructs';
import * as unifi from '../.gen/providers/unifi';
import {
    RemoteBackendStackProps,
  RemoteBackendStack,
} from '../constructs/RemoteBackendStack';
import { NetworkConfig } from '../.gen/providers/unifi/network';

export class UnifiNetworkSetupStack extends RemoteBackendStack {
  constructor(scope: Construct, name: string, props: RemoteBackendStackProps) {
    super(scope, name, props);

    /**
     * Unifi Provider
     */

    new unifi.provider.UnifiProvider(this, 'UnifiProvider', {
      apiUrl: this.getSopsSecretValue('provider.unifi.url'),
      username: this.getSopsSecretValue('provider.unifi.username'),
      password: this.getSopsSecretValue('provider.unifi.password'),
    });

    //const unifiNetworkBase = new unifi.dataUnifiNetwork.DataUnifiNetwork(
    //  this,
    //  'UnifiNetworkBase',
    //  {
    //    name: 'ZuHause',
    //  }
    //);

    //new unifi.portProfile.PortProfile(this, 'UnifiPortProfileLab', {
    //    autoneg: true,
    //    name: 'ZuHause (Homelab allowed)',
    //    nativeNetworkconfId: unifiNetworkBase.id,
    //    taggedNetworkconfIds: [
    //        unifiNetworkHomelab.id,
    //    ],
    //    poeMode: 'auto',
    //})
  }

  public addNetwork(config: NetworkConfig): UnifiNetwork {
    return new UnifiNetwork(this, `UnifiNetwork-${config.name}`, config);
  }
}

export interface UnifiNetworkClientProps {
  /**
   * The name of the client.
   */
  readonly name: string;
  /**
   * The MAC address of the client.
   */
  readonly mac: string;
  /**
   * A fixed IPv4 address for the client.
   */
  readonly fixedIp?: string;
}
export class UnifiNetwork extends Construct {
  public readonly unifiNetwork: unifi.network.Network;

  constructor(scope: Construct, id: string, config: NetworkConfig) {
    super(scope, id);

    this.unifiNetwork = new unifi.network.Network(this, 'UnifiNetwork', config);
  }

  public addClient(props: UnifiNetworkClientProps): unifi.user.User {
    return new unifi.user.User(this, `User-${props.name}`, {
      mac: props.mac,
      name: props.name,
      fixedIp: props.fixedIp,
      networkId: this.unifiNetwork.id,
    });
  }
}
