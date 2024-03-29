import { Construct } from 'constructs';
import { ITerraformDependable } from 'cdktf';
import * as proxmox from '../.gen/providers/proxmox';
import * as time from '../.gen/providers/time';
import { RemoteBackendStack, RemoteBackendStackProps } from '../constructs/CustomStack';
import { MacAddress } from '../constructs/MacAddress';
import { UnifiNetwork } from './UnifiNetworkSetupStack';
import { VmQemu } from '../.gen/providers/proxmox/vm-qemu';

export class ProxmoxVmStack extends RemoteBackendStack {

  constructor(scope: Construct, name: string, props: RemoteBackendStackProps ) {

    super(scope, name, props);

    /**
     * Proxmox Provider
     */

    new proxmox.provider.ProxmoxProvider(this, 'ProviderProxmox', {
      pmApiUrl: this.getSopsSecretValue('provider.proxmox.url'),
      pmUser: this.getSopsSecretValue('provider.proxmox.username'),
      pmPassword: this.getSopsSecretValue('provider.proxmox.password'),
    });

    /**
     * Time Provider
     */

    new time.provider.TimeProvider(this, 'ProviderTime4Pause');

  }

  /**
   * Adds a virtual machine to the current stack
   */
  public addVirtualMachine(props: VirtualMachineProps): VirtualMachine {
    return new VirtualMachine(this, props);
  }
}

export interface VirtualMachineProps {
    /**
     * Name of the virtual machine
     */
    readonly name: string;
    readonly unifiNetwork: UnifiNetwork;
    readonly fixedIp: string;
    /**
     * How many cores should the machine have?
     */
    readonly cores?: number;
    readonly sockets?: number;
    readonly iso: string;
    readonly memory?: number;
    readonly boot?: string;
    readonly storage: number;
    readonly pause: string;
    readonly args?: string;
    readonly vmid?: number;
}

export class VirtualMachine extends Construct implements ITerraformDependable {

    public readonly mac: MacAddress;
    public readonly vmQemu: VmQemu;
    public readonly name: string;
    public readonly fqn: string;
    public readonly fixedIp: string;

    constructor(scope: Construct, props: VirtualMachineProps) {
        super(scope, `VirtualMachine-${props.name}`);

        this.mac = new MacAddress(this, props.name);
        this.name = props.name;
        this.fixedIp = props.fixedIp;

        props.unifiNetwork.addClient({
            mac: this.mac.address,
            name: props.name,
            fixedIp: props.fixedIp,
        });
        
        this.vmQemu = new VmQemu(this, `VmQemu-${props.name}`, {
            targetNode: 'pve',
            name: props.name,
            cores: props.cores ?? 2,
            sockets: props.sockets ?? 1,
            onboot: true,
            qemuOs: 'other',
            oncreate: true,
            automaticReboot: true,
            vmid: props.vmid,
            iso: props.iso,
            memory: (props.memory ?? 4) * 1024,
            cpu: 'host',
            balloon: 0,
            boot: props.boot,
            args: props.args,
            scsihw: 'virtio-scsi-single',
            network: [
                {
                model: 'virtio',
                bridge: 'vmbr0',
                //tag: props.unifiNetwork.unifiNetwork.vlanId,
                macaddr: this.mac.address,
                },
            ],
            disk: [
              {
                size: `${props.storage ?? 8}G`,
                storage: 'vm-storage',
                type: 'scsi',
                backup: false,
                cache: 'none',
                iops: 0,
                iopsMax: 0,
                iopsMaxLength: 0,
                iopsRd: 0,
                iopsRdMax: 0,
                iopsRdMaxLength: 0,
                iopsWr: 0,
                iopsWrMax: 0,
                iopsWrMaxLength: 0,
                iothread: 1,
                mbps: 0,
                mbpsRd: 0,
                mbpsRdMax: 0,
                mbpsWr: 0,
                mbpsWrMax: 0,
                replicate: 0,
              },
            ],
            lifecycle: {
              ignoreChanges: ['disk']
            }
        });

        new Disk()

        const sleepAfterVmCreate = new time.sleep.Sleep(this, `VmQemu-${props.name}-Sleep`, {
            createDuration: props.pause ?? '30s',
            dependsOn: [this.vmQemu],
        });

        this.fqn = sleepAfterVmCreate.fqn;
    }

}