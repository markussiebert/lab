import { Construct } from 'constructs';
import * as talos from '../.gen/providers/talos';

export interface TalosClusterProps {
  /**
   * The hostname/ip this cluster will be reachable
   *
   * The result will look like: https://${clusterEndpoint}:6443
   */
  readonly clusterEndpoint: string;
}

export interface TalosNode {
  readonly name: string;
  readonly hostname: string;
  readonly type: 'Worker' | 'ControlPlane';
  readonly appliedMachineConfiguration: talos.machineConfigurationApply.MachineConfigurationApply;
}

export class TalosCluster extends Construct {
  public readonly machineSecrets: string;
  public readonly talosConfig: string;
  public readonly clusterEndpoint: string;
  public readonly clusterName: string;
  public readonly machineConfigurationControlPlane: string;
  public readonly machineConfigurationWorker: string;

  constructor(scope: Construct, name: string, props: TalosClusterProps) {
    super(scope, name);

    new talos.provider.TalosProvider(this, 'TalosProvider');

    this.clusterName = name;
    this.clusterEndpoint = `https://${props.clusterEndpoint}:6443`;

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
  }

  public addControlPlaneNode(
    name: string,
    endpoint: string,
    hostname: string
  ): TalosNode {
    const appliedMachineConfiguration =
      new talos.machineConfigurationApply.MachineConfigurationApply(
        this,
        `ControlPlaneNode${name}`,
        {
          endpoint: endpoint,
          machineConfiguration: this.machineConfigurationControlPlane,
          talosConfig: this.talosConfig,
          configPatches: [
            [
              'machine:',
              '  install:',
              '    disk: /dev/sda',
              '  network:',
              `    hostname: ${hostname}`,
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
        }
      );
    return {
      name,
      hostname,
      appliedMachineConfiguration,
      type: 'ControlPlane',
    };
  }

  /**
   * If you create a new cluster, you must bootstrap one node (create a single node cluster).
   * Other nodes will join ...
   */
  public bootStrap(node: TalosNode) {
    new talos.machineBootstrap.MachineBootstrap(this, 'MachineBootstrap', {
      talosConfig: this.talosConfig,
      endpoint: node.appliedMachineConfiguration.endpoint,
      nodeAttribute: node.appliedMachineConfiguration.nodeAttribute,
    });
  }

  public getKubeConfig(node: TalosNode): string {
    return new talos.clusterKubeconfig.ClusterKubeconfig(
      this,
      `KubeConfig${node.name}`,
      {
        talosConfig: this.talosConfig,
        endpoint: node.appliedMachineConfiguration.endpoint,
        nodeAttribute: node.appliedMachineConfiguration.nodeAttribute,
      }
    ).kubeConfig;
  }
}
