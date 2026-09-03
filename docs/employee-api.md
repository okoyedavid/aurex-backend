# Business-scoped employee API

Employees are addressable as first-class business resources. `EmployeeList`
remains the underlying department/list relationship; these routes do not rename
or replace it.

## Preferred routes

All routes require normal authentication and active business membership.

```http
GET /api/businesses/:businessId/employees
GET /api/businesses/:businessId/employees/:employeeId
PATCH /api/businesses/:businessId/employees/:employeeId
```

List and detail require `employees:view`. PATCH requires `employees:update`.
`employees:view_own` does not grant business-wide access.

The existing list-scoped routes remain supported for compatibility:

```http
GET /api/businesses/:businessId/employee-lists/:employeeListId/employees
GET /api/businesses/:businessId/employee-lists/:employeeListId/employees/:employeeId
PATCH /api/businesses/:businessId/employee-lists/:employeeListId/employees/:employeeId
```

## Business employee directory

Supported query parameters:

```text
page
limit              maximum 100
search             case-insensitive fullName/jobTitle search
employeeListId     department/list filter
employeeTypeId
groupId
state              case-insensitive exact match
status             active, suspended, on leave, or archived
```

Archived employees are excluded unless `status=archived` is explicitly used.
The response follows Aurex's `{ success, message, data }` envelope. `data`
contains `items` and:

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

Rows contain resolved department, employee-type and group names. They exclude
payroll amounts and full account numbers.

## Employee profile

The canonical detail response resolves the employee's department, type, groups
and lightweight manager summary. It calculates `tenureMonths` from
`employmentStartDate`; tenure is not persisted.

Bank account numbers are returned only as `maskedAccountNumber`. If a test or
provider account name contains the stored account number, that occurrence is
masked as well.

The detail DTO includes payroll metadata because the current RBAC model has one
`employees:view` permission rather than separate HR and payroll-detail grants.
This preserves existing authorization semantics; a future permission split can
restrict the payroll section without changing the canonical route.

Policy data remains composable through the existing endpoints:

```http
GET /api/businesses/:businessId/employees/:employeeId/policies
GET /api/businesses/:businessId/employees/:employeeId/policies/explain
GET /api/businesses/:businessId/employees/:employeeId/policy-history
```
