# HomeLab Setup

This is a work in progress project. Very early stage ...

## Technologies

### Secerts

- mozilla sops

### Infrastructure

- cdktf (Terraform in a acceptable way)

### K8s Deployments
- cdk8s
- (flux)

## Prerequisites (not part )

- Working unifi setup
- Working dns server
- Working proxmox hosts (with needed iso images)
- Github Repo for flux with api token scoped to this repository

## What's working

- Configure unifi (create network for HomeLab)
- Spinning up VMs with proxmox
- Create a Talos-Cluster with those VMs

## Open questions

- How to run db?
- How to handle storage in cluster?

## ToDo
- Download the talos iso as needed asset (done) and upload it to Proxmox


## Things tried out, but won't use

### Sidero Metal

Great Tool. ClusterAPI and PXE Boot work. But without professional server hardware (ipmi/bmc support) you have to reboot and configure the boot order manually. All in all no advantage over the “plain” terraform approach.

There are things like virtual IPMI for Proxmox - but seams really dirty and you have to configure it for each vm - once again no advantage over sticking to plain terraform.