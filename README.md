# rxjs-resource

RXJS library for working with data with asynchronous initialization and complex dependencies.
This library depends on RxJS and is very well suited for Angular projects.
In essence, this library is an alternative to using State managers such as NgRx or NGXS.
Especially when the data needs to be initialized asynchronously and they are very dependent on each other.

## Installation

`npm install rxjs-resource` or `yarn add rxjs-resource`

## Usage

```typescript

@Injectable()
export class MyDataProviderService implements OnDestroy {

    private readonly currentOrgIdResource = new Resource<number>({
        init: () => {
            return this.organizationService.awaitCurrentOrganizationId(); // It is a Promise
        },
    });

    private readonly organizationResource = new Resource<Organization>({
        init: async (deps) => {
            const orgId = deps[0] as number;
            const organizationList = await this.organizationService.awaitOrganizationList();
            return organizationList.find(org => org.id === orgId)!;
        },
        dependencies: [
            this.organizationIdResource,
        ],
    });
    
}

```
