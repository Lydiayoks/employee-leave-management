import {
  query,
  update,
  text,
  Null,
  Record,
  StableBTreeMap,
  Variant,
  Vec,
  Ok,
  Err,
  ic,
  nat64,
  Result,
  bool,
  Canister,
} from "azle";

import { v4 as uuidv4 } from "uuid";

// Enums
const LeaveName = Variant({
  Annual: Null,
  Sick: Null,
  Maternity: Null,
  Paternity: Null,
  Unpaid: Null,
});

const LeaveStatusEnum = Variant({
  Pending: Null,
  Approved: Null,
  Rejected: Null,
});

// Structs
const LeaveBalances = Record({
  Annual: nat64,
  Sick: nat64,
  Maternity: nat64,
  Paternity: nat64,
  Unpaid: nat64,
});

const Employee = Record({
  id: text,
  name: text,
  email: text,
  phone_number: text,
  leave_balances: LeaveBalances,
  created_at: nat64,
});

const LeaveRequest = Record({
  id: text,
  employee_id: text,
  leave_type_id: text,
  start_date: nat64,
  end_date: nat64,
  status: text,
  reason: text,
  created_at: nat64,
});

const LeaveType = Record({
  id: text,
  name: LeaveName,
  quota: nat64, // Max days allowed per year
  carryover_allowed: bool,
  created_at: nat64,
});

// Payloads

// Employee Payload
const EmployeePayload = Record({
  name: text,
  email: text,
  phone_number: text,
});

// Leave Request Payload
const LeaveRequestPayload = Record({
  employee_id: text,
  leave_type_id: text,
  start_date: nat64,
  end_date: nat64,
  reason: text,
});

// Leave Type Payload
const LeaveTypePayload = Record({
  name: LeaveName,
  quota: nat64,
  carryover_allowed: bool,
});

// Message Enum
const Message = Variant({
  Success: text,
  Error: text,
  NotFound: text,
  InvalidPayload: text,
});

// Storage
const employeeStorage = StableBTreeMap(0, text, Employee);
const leaveRequestStorage = StableBTreeMap(1, text, LeaveRequest);
const leaveTypeStorage = StableBTreeMap(2, text, LeaveType);

// Functions

export default Canister({
  // Create Employee Profile with Validations
  createEmployee: update(
    [EmployeePayload],
    Result(Employee, Message),
    (payload) => {
      // Validate the payload to ensure all required fields are present
      if (!payload.name || !payload.email || !payload.phone_number) {
        return Err({
          InvalidPayload: "Ensure 'name' and 'email' are provided.",
        });
      }

      // Check for valid email format (simple regex example)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(payload.email)) {
        return Err({ InvalidPayload: "Invalid email format" });
      }

      // Ensure the email is unique
      const existingEmployee = employeeStorage
        .values()
        .find((employee) => employee.email === payload.email);
      if (existingEmployee) {
        return Err({ InvalidPayload: "Email already exists." });
      }

      // Validate the phone number format with an international flair
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(payload.phone_number)) {
        return Err({
          InvalidPayload:
            "Invalid phone number format, try including your country code like a world traveler!",
        });
      }

      // Generate a new employee ID
      const employeeId = uuidv4();

      // Create the employee record
      const employee = {
        id: employeeId,
        ...payload,
        leave_balances: {
          Annual: 20n,
          Sick: 20n,
          Maternity: 20n,
          Paternity: 20n,
          Unpaid: 20n,
        },
        created_at: ic.time(),
      };

      // Store the employee record
      employeeStorage.insert(employeeId, employee);

      // Return the employee record
      return Ok(employee);
    }
  ),

  // Get all Employees
  getEmployees: query([], Result(Vec(Employee), Message), () => {
    const employees = employeeStorage.values();
    if (employees.length === 0) {
      return Err({ NotFound: "No employees found" });
    }
    return Ok(employees);
  }),

  // Create Leave Request
  createLeaveRequest: update(
    [LeaveRequestPayload],
    Result(LeaveRequest, Message),
    (payload) => {
      // Validate the payload to ensure all required fields are present
      if (
        !payload.employee_id ||
        !payload.leave_type_id ||
        !payload.start_date ||
        !payload.end_date ||
        !payload.reason
      ) {
        return Err({
          InvalidPayload:
            "Ensure 'employee_id', 'leave_type_id', 'start_date', 'end_date', and 'reason' are provided.",
        });
      }

      // Check if the employee exists
      const employeeOpt = employeeStorage.get(payload.employee_id);
      if ("None" in employeeOpt) {
        return Err({ NotFound: "Employee not found" });
      }

      // Check if the leave type exists
      const leaveTypeOpt = leaveTypeStorage.get(payload.leave_type_id);
      if ("None" in leaveTypeOpt) {
        return Err({ NotFound: "Leave type not found" });
      }

      const leaveRequestId = uuidv4();

      // Create the leave request record
      const leaveRequest = {
        id: leaveRequestId,
        employee_id: payload.employee_id,
        leave_type_id: payload.leave_type_id,
        start_date: payload.start_date,
        end_date: payload.end_date,
        status: "Pending",
        reason: payload.reason,
        created_at: ic.time(),
      };

      // Store the leave request record
      leaveRequestStorage.insert(leaveRequestId, leaveRequest);

      return Ok(leaveRequest);
    }
  ),

  // Get all Leave Requests for an Employee
  getEmployeeLeaveRequests: query(
    [text],
    Result(Vec(LeaveRequest), Message),
    (employeeId) => {
      const leaveRequests = leaveRequestStorage
        .values()
        .filter((req) => req.employee_id === employeeId);
      if (leaveRequests.length === 0) {
        return Err({
          NotFound: `No leave requests found for employee with id ${employeeId}`,
        });
      }
      return Ok(leaveRequests);
    }
  ),

  // Get all Leave Requests
  getLeaveRequests: query([], Result(Vec(LeaveRequest), Message), () => {
    const leaveRequests = leaveRequestStorage.values();
    if (leaveRequests.length === 0) {
      return Err({ NotFound: "No leave requests found" });
    }
    return Ok(leaveRequests);
  }),

  approveLeaveRequest: update([text], Result(Message, Message), (requestId) => {
    // Fetch the specific leave request by ID
    const leaveRequestOpt = leaveRequestStorage.get(requestId);
    if ("None" in leaveRequestOpt) {
      return Err({ NotFound: "Leave request not found" });
    }

    const leaveRequest = leaveRequestOpt.Some;

    // Ensure the leave request is not already approved
    if (leaveRequest.status === "Approved") {
      return Err({
        Error: "Leave request is already approved.",
      });
    }

    // Fetch the employee associated with the leave request
    const employeeOpt = employeeStorage.get(leaveRequest.employee_id);
    if ("None" in employeeOpt) {
      return Err({ NotFound: "Employee not found" });
    }

    const employee = employeeOpt.Some;

    // Initialize leave balances if they don't exist
    if (!employee.leave_balances) {
      return Err({
        Error: "Leave balances not initialized for this employee.",
      });
    }

    // Fetch the corresponding leave type
    const leaveTypeOpt = leaveTypeStorage.get(leaveRequest.leave_type_id);
    if ("None" in leaveTypeOpt) {
      return Err({ NotFound: "Leave type not found" });
    }

    const leaveType = leaveTypeOpt.Some;

    // Fetch the employee's leave balance for this leave type
    // Since leave_balances is a record, we access the property directly
    const balance = employee.leave_balances[leaveType.name] ?? 0n;

    // Debug log the leave balance and quota
    console.log(`Leave balance for ${leaveType.name}: ${balance}`);
    console.log(`Leave quota for ${leaveType.name}: ${leaveType.quota}`);

    // Check if the employee has sufficient leave balance
    if (balance < leaveType.quota) {
      return Err({
        Error: `Insufficient leave balance for this leave type. Available: ${balance}, Required: ${leaveType.quota}`,
      });
    }

    // Deduct the leave quota from the employee's balance
    employee.leave_balances[leaveType.name] = balance - leaveType.quota;

    // Log the updated leave balance after deduction
    console.log(
      `Updated leave balance for ${leaveType.name}: ${
        employee.leave_balances[leaveType.name]
      }`
    );

    // Update the leave request status to "Approved"
    leaveRequest.status = "Approved";

    // Save the updated leave request and employee records
    leaveRequestStorage.insert(requestId, leaveRequest);
    employeeStorage.insert(employee.id, employee);

    return Ok({ Success: "Leave request approved and leave balance updated." });
  }),

  // Create Leave Type
  createLeaveType: update(
    [LeaveTypePayload],
    Result(LeaveType, Message),
    (payload) => {
      // Validate the payload to ensure all required fields are present
      if (!payload.name || !payload.quota) {
        return Err({
          InvalidPayload: "Ensure 'name' and 'quota' are provided.",
        });
      }

      // Generate a new leave type ID
      const leaveTypeId = uuidv4();

      // Create the leave type record
      const leaveType = {
        id: leaveTypeId,
        name: payload.name,
        quota: payload.quota,
        carryover_allowed: payload.carryover_allowed,
        created_at: ic.time(),
      };

      // Store the leave type record
      leaveTypeStorage.insert(leaveTypeId, leaveType);

      // Return the leave type record
      return Ok(leaveType);
    }
  ),

  // Get all Leave Types
  getLeaveTypes: query([], Result(Vec(LeaveType), Message), () => {
    const leaveTypes = leaveTypeStorage.values();
    if (leaveTypes.length === 0) {
      return Err({ NotFound: "No leave types found" });
    }
    return Ok(leaveTypes);
  }),

  // Accrue Leave
  accrueLeave: update([text], Result(Message, Message), (leaveRequestId) => {
    // Fetch the specific leave request by ID
    const leaveRequestOpt = leaveRequestStorage.get(leaveRequestId);
    if ("None" in leaveRequestOpt) {
      return Err({ NotFound: "Leave request not found" });
    }

    let leaveRequest = leaveRequestOpt.Some;

    // Ensure the leave request is approved and not already accrued
    if (leaveRequest.status === "Accrued") {
      return Err({ Error: "Leave request already accrued." });
    }

    if (leaveRequest.status !== "Approved") {
      return Err({ Error: "Leave request is not approved." });
    }

    // Fetch the employee associated with the leave request
    const employeeOpt = employeeStorage.get(leaveRequest.employee_id);
    if ("None" in employeeOpt) {
      return Err({ NotFound: "Employee not found" });
    }

    let employee = employeeOpt.Some;

    // Fetch the corresponding leave type
    const leaveTypeOpt = leaveTypeStorage.get(leaveRequest.leave_type_id);
    if ("None" in leaveTypeOpt) {
      return Err({ NotFound: "Leave type not found" });
    }

    let leaveType = leaveTypeOpt.Some;

    // Fetch the current balance or default to zero if none exists
    let balance = employee.leave_balances.get(leaveType.name) ?? 0n;

    // Subtract the leave type's quota from the balance
    balance = balance - leaveType.quota;

    // Update the leave balance
    employee.leave_balances.set(leaveType.name, balance);

    // Update the leave request status to "Accrued"
    leaveRequest.status = "Accrued";

    // Update the leave request in the storage
    leaveRequestStorage.insert(leaveRequestId, leaveRequest);

    // Update the employee in the storage
    employeeStorage.insert(employee.id, employee);

    return Ok({
      Success: "Leave request accrued successfully and balance updated.",
    });
  }),
  // Generate Leave Report
  generateLeaveReport: query([text], Result(text, Message), (employeeId) => {
    // Fetch all leave requests for the employee
    const leaveRequests = leaveRequestStorage
      .values()
      .filter((request) => request.employee_id === employeeId);

    // Check if there are any leave requests for the employee
    if (leaveRequests.length === 0) {
      return Err({ NotFound: "No leave requests found for the employee." });
    }

    // Fetch the employee by ID
    const employeeOpt = employeeStorage.get(employeeId);
    if ("None" in employeeOpt) {
      return Err({ NotFound: "Employee not found." });
    }

    const employee = employeeOpt.Some;

    // Initialize the report with employee details
    let report = `Leave report for ${employee.name} (Employee ID: ${employee.id})\n\n`;

    // Loop through all leave requests to generate the detailed report
    for (const request of leaveRequests) {
      const leaveTypeOpt = leaveTypeStorage.get(request.leave_type_id);
      if ("None" in leaveTypeOpt) {
        return Err({
          NotFound: `Leave type not found for request ID: ${request.id}`,
        });
      }

      const leaveType = leaveTypeOpt.Some;
      const leaveBalance = employee.leave_balances[leaveType.name] ?? 0n;

      // Append the details of each leave request to the report
      report += `Leave Request ID: ${request.id}\nLeave Type: ${leaveType.name}\nQuota: ${leaveType.quota}\nRemaining Leaves: ${leaveBalance}\nStart Date: ${request.start_date}\nEnd Date: ${request.end_date}\nStatus: ${request.status}\nReason: ${request.reason}\n\n`;
    }

    return Ok(report);
  }),

  // Cancel Leave Request
  cancelLeaveRequest: update([text], Result(Message, Message), (requestId) => {
    // Fetch the specific leave request by ID
    const leaveRequestOpt = leaveRequestStorage.get(requestId);
    if ("None" in leaveRequestOpt) {
      return Err({ NotFound: "Leave request not found" });
    }

    const leaveRequest = leaveRequestOpt.Some;

    // Check if the leave request has been approved
    if (leaveRequest.status === "Approved") {
      return Err({
        Error: "Cannot cancel an approved leave request.",
      });
    }

    // Remove the leave request from the storage
    leaveRequestStorage.remove(requestId);

    return Ok({ Success: "Leave request canceled successfully." });
  }),
});
