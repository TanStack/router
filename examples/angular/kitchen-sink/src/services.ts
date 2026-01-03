import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom, tap } from 'rxjs';
import { actionDelayFn, loaderDelayFn, shuffle } from './utils';

export type Invoice = {
  id: number;
  title: string;
  body: string;
};

export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  address: Address;
  phone: string;
  website: string;
  company: Company;
}

export interface Address {
  street: string;
  suite: string;
  city: string;
  zipcode: string;
  geo: Geo;
}

export interface Geo {
  lat: string;
  lng: string;
}

export interface Company {
  name: string;
  catchPhrase: string;
  bs: string;
}

@Injectable({
  providedIn: 'root',
})
export class InvoiceService {
  readonly #httpClient = inject(HttpClient);

  #invoices: Array<Invoice> = [];

  #invoicesPromise: Promise<any> | undefined;

  private ensureInvoices = async () => {
    if (!this.#invoicesPromise) {
      this.#invoicesPromise = lastValueFrom(
        this.#httpClient
          .get<Array<Invoice>>('https://jsonplaceholder.typicode.com/posts')
          .pipe(tap((data) => (this.#invoices = data.slice(0, 10)))),
      );
    }
    await this.#invoicesPromise;
  };

  fetchInvoices() {
    return loaderDelayFn(() => this.ensureInvoices().then(() => this.#invoices));
  }

  fetchInvoiceById(id: number) {
    return loaderDelayFn(() =>
      this.ensureInvoices().then(() => this.#invoices.find((invoice) => invoice.id === id)),
    );
  }

  postInvoice(partialInvoice: Partial<Invoice>) {
    return actionDelayFn(() => {
      if (partialInvoice.title?.includes('error')) {
        console.error('error');
        throw new Error('Ouch!');
      }

      const invoice = {
        id: this.#invoices.length + 1,
        title: partialInvoice.title ?? `New Invoice ${String(Date.now()).slice(0, 5)}`,
        body:
          partialInvoice.body ??
          shuffle(
            `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
      Fusce ac turpis quis ligula lacinia aliquet. Mauris ipsum. Nulla metus metus, ullamcorper vel, tincidunt sed, euismod in, nibh. Quisque volutpat condimentum velit. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nam nec ante. 
      Vestibulum sapien. Proin quam. Etiam ultrices. Suspendisse in justo eu magna luctus suscipit. Sed lectus. Integer euismod lacus luctus magna.  Integer id quam. Morbi mi. Quisque nisl felis, venenatis tristique, dignissim in, ultrices sit amet, augue. Proin sodales libero eget ante.
      `.split(' '),
          ).join(' '),
      };

      this.#invoices = [...this.#invoices, invoice];
      return invoice;
    });
  }

  patchInvoice(id: number, partialInvoice: Partial<Invoice>) {
    return actionDelayFn(() => {
      if (partialInvoice.title?.includes('error')) {
        console.error('error');
        throw new Error('Ouch!');
      }
      const index = this.#invoices.findIndex((invoice) => invoice.id === id);

      if (index === -1) {
        throw new Error('Invoice not found.');
      }

      const newArray = [...this.#invoices];
      newArray[index] = { ...this.#invoices[index], ...partialInvoice, id };

      this.#invoices = newArray;
      return this.#invoices[index];
    });
  }
}

type UsersSortBy = 'name' | 'id' | 'email';

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  readonly #httpClient = inject(HttpClient);

  #users: Array<User> = [];

  #usersPromise: Promise<any> | undefined;

  private ensureUsers = async () => {
    if (!this.#usersPromise) {
      this.#usersPromise = lastValueFrom(
        this.#httpClient
          .get<Array<User>>('https://jsonplaceholder.typicode.com/users')
          .pipe(tap((data) => (this.#users = data.slice(0, 10)))),
      );
    }
    await this.#usersPromise;
  };

  fetchUsers({ filterBy, sortBy }: { filterBy?: string; sortBy?: UsersSortBy } = {}) {
    return loaderDelayFn(() =>
      this.ensureUsers().then(() => {
        let usersDraft = this.#users;

        if (filterBy) {
          usersDraft = usersDraft.filter((user) =>
            user.name.toLowerCase().includes(filterBy.toLowerCase()),
          );
        }

        if (sortBy) {
          usersDraft = usersDraft.sort((a, b) => {
            return a[sortBy] > b[sortBy] ? 1 : -1;
          });
        }

        return usersDraft;
      }),
    );
  }

  fetchUserById(id: number) {
    return loaderDelayFn(() =>
      this.ensureUsers().then(() => this.#users.find((user) => user.id === id)),
    );
  }
}

@Injectable({
  providedIn: 'root',
})
export class RandomService {
  fetchRandomNumber() {
    return loaderDelayFn(() => {
      return Math.random();
    });
  }
}
