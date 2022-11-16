import { Construct } from 'constructs';
import {
  RemoteBackendStackProps,
  RemoteBackendStack,
} from '../constructs/CustomStack';
import { ITerraformDependable, Lazy } from 'cdktf';
import * as talos from '../.gen/providers/talos';
import * as time from '../.gen/providers/time';
import * as local from '../.gen/providers/local';

export interface TalosClusterStackProps extends RemoteBackendStackProps {
  /**
   * The hostname/ip this cluster will be reachable
   *
   * The result will look like: https://${clusterEndpoint}:6443
   */
  readonly clusterEndpoint: string;
  readonly clusterName: string;
  readonly vipIp: string;
}

export class TalosClusterStack extends RemoteBackendStack {

  public readonly machineSecrets: string;
  public readonly talosConfig: string;
  public readonly clusterEndpoint: string;
  public readonly clusterName: string;
  public readonly machineConfigurationControlPlane: string;
  public readonly machineConfigurationWorker: string;
  public readonly bootStrap:talos.machineBootstrap.MachineBootstrap;
  public readonly vipIp:string;
  public readonly nodes:TalosNode[];

  constructor(scope: Construct, name: string, props: TalosClusterStackProps) {
    super(scope, name, props);

    new talos.provider.TalosProvider(this, 'TalosProvider');
    new time.provider.TimeProvider(this, 'ProviderTime4Pause');
    new local.provider.LocalProvider(this, 'LocalProvider');

    this.clusterName = props.clusterName;
    this.clusterEndpoint = `https://${props.clusterEndpoint}:6443`;
    this.vipIp = props.vipIp;

    this.machineSecrets = new talos.machineSecrets.MachineSecrets(
      this,
      'MachineSecrets'
    ).machineSecrets;

    this.talosConfig = new talos.clientConfiguration.ClientConfiguration(
      this,
      'ClientConfiguration',
      {
        clusterName: this.clusterName,
        machineSecrets: this.machineSecrets,
      }
    ).talosConfig;

    this.machineConfigurationControlPlane =
      new talos.machineConfigurationControlplane.MachineConfigurationControlplane(
        this,
        'MachineConfigurationControlplane',
        {
          clusterEndpoint: this.clusterEndpoint,
          clusterName: this.clusterName,
          machineSecrets: this.machineSecrets,
        }
      ).machineConfig;

    this.machineConfigurationWorker =
      new talos.machineConfigurationWorker.MachineConfigurationWorker(
        this,
        'MachineConfigurationWorker',
        {
          clusterEndpoint: this.clusterEndpoint,
          clusterName: this.clusterName,
          machineSecrets: this.machineSecrets,
        }
      ).machineConfig;
    
    this.nodes = [];

    this.bootStrap = new talos.machineBootstrap.MachineBootstrap(
      this,
      'MachineBootstrap',
      {
        talosConfig: this.talosConfig,
        endpoint: Lazy.stringValue( { produce: () => this.nodes[0].appliedMachineConfiguration.endpoint }),
        nodeAttribute: Lazy.stringValue( { produce: () => this.nodes[0].appliedMachineConfiguration.nodeAttribute }),
        lifecycle: {
          ignoreChanges: "all",
        }
      }
    );
    
    new time.sleep.Sleep(this, `MachineBootstrapSleep`, {
      createDuration: '3m',
      dependsOn: [this.bootStrap],
    });
  }

  public addControlPlaneNode(name: string, endpoint: string): TalosNode {
    const node = new TalosNode(this, `ControlPlaneNode-${name}`, 'ControlPlane', {
      endpoint: endpoint,
      machineConfiguration: this.machineConfigurationControlPlane,
      talosConfig: this.talosConfig,
      configPatches: [
        [
          'machine:',
          '  install:',
          '    disk: /dev/sda',
          '  network:',
          `    hostname: ${name}`,
          // TODO: Move to interface - vip 
          `    interfaces:`,
          `    - interface: eth0`,
          `      dhcp: true`,
          `      vip:`,
          `        ip: ${this.vipIp}`, 
        ].join('\n'),
        JSON.stringify([
          {
            op: 'add',
            path: '/cluster/allowSchedulingOnControlPlanes',
            value: true,
          },
        ]),
      ],
      nodeAttribute: endpoint,
    });
    this.nodes.push(node);
    return node;
  }
}

export class TalosNode extends Construct implements ITerraformDependable {
  readonly type: 'Worker' | 'ControlPlane';
  readonly appliedMachineConfiguration: talos.machineConfigurationApply.MachineConfigurationApply;
  fqn: string;

  constructor(
    scope: Construct,
    name: string,
    type: 'Worker' | 'ControlPlane',
    config: talos.machineConfigurationApply.MachineConfigurationApplyConfig
  ) {
    super(scope, name);
    (this.type = type),
      (this.appliedMachineConfiguration =
        new talos.machineConfigurationApply.MachineConfigurationApply(
          this,
          `MachineConfiguration`,
          config
        ));
    this.fqn = this.appliedMachineConfiguration.fqn;
  }

  public getKubeConfig(): string {
    return new talos.clusterKubeconfig.ClusterKubeconfig(this, 'KubeConfig', {
      talosConfig: this.appliedMachineConfiguration.talosConfig,
      endpoint: this.appliedMachineConfiguration.endpoint,
      nodeAttribute: this.appliedMachineConfiguration.nodeAttribute,
    }).kubeConfig;
  }

  public saveKubeConfig(filename: string) {
    new local.sensitiveFile.SensitiveFile(
      this,
      'SideroTalosSingleNodeClusterKubeConfig',
      {
        filename,
        content: this.getKubeConfig(),
      }
    );
  }
}
