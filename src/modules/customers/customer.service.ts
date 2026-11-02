import { CustomerRepository, customerRepository } from './customer.repository.js';
import { Customer } from '@prisma/client';
import { NotFoundError } from '../../common/errors/app-error.js';

export class CustomerService {
  private repo: CustomerRepository;

  constructor(repo: CustomerRepository = customerRepository) {
    this.repo = repo;
  }

  public async getCustomerById(id: string): Promise<Customer> {
    const customer = await this.repo.findById(id);
    if (!customer) {
      throw new NotFoundError(`Customer with ID '${id}' not found`);
    }
    return customer;
  }

  public async getCustomerByExternalId(externalId: string): Promise<Customer> {
    const customer = await this.repo.findByExternalId(externalId);
    if (!customer) {
      throw new NotFoundError(`Customer with external ID '${externalId}' not found`);
    }
    return customer;
  }
}

export const customerService = new CustomerService();

