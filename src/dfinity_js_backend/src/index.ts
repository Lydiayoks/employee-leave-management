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

// Helper Functions

const checkLeaveOverlap = (employeeId, startDate, endDate) => {
  const leaveRequests = leaveRequestStorage.values().filter(
    (request) =>
      request.employee_id === employeeId &&
      request.status !== "Rejected" &&
      ((startDate >= request.start_date && startDate <= request.end_date) ||
        (endDate >= request.start_date && endDate <= request.end_date))
  );
  return leaveRequests.length > 0;
};

const validateLeaveBalance = (employee, leaveTypeId) => {
  const leaveTypeOpt = leaveTypeStorage.get(leaveTypeId);
  if ("None" in leaveTypeOpt) {
    return { valid: false, error: "Leave type not found" };
  }

  const leaveType = leaveTypeOpt.Some;
  const balance = employee.leave_balances[leaveType.name] ?? 0n;
  return balance >= leaveType.quota
    ? { valid: true, leaveType }
    : {
        valid: false,
        error: `Insufficient leave balance for this leave type.`,
      };
};

const validateEmployee = (employeeId) => {
  const employeeOpt = employeeStorage.get(employeeId);
  return "None" in employeeOpt
    ? { valid: false, error: "Employee not found" }
    : { valid: true, employee: employeeOpt.Some };
};



export default Canister({
  createEmployee: update([EmployeePayload], Result(Employee, Message), (payload) => {
    if (!payload.name || !payload.email || !payload.phone_number) {
      return Err({ InvalidPayload: "Ensure 'name', 'email', and 'phone number' are provided." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.email)) {
      return Err({ InvalidPayload: "Invalid email format" });
    }

    const existingEmployee = employeeStorage.values().find((emp) => emp.email === payload.email);
    if (existingEmployee) {
      return Err({ InvalidPayload: "Email already exists." });
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(payload.phone_number)) {
      return Err({ InvalidPayload: "Invalid phone number format." });
    }

    const employeeId = uuidv4();
    const employee = {
      id: employeeId,
      ...payload,
      leave_balances: { Annual: 20n, Sick: 20n, Maternity: 20n, Paternity: 20n, Unpaid: 20n },
      created_at: ic.time(),
    };

    employeeStorage.insert(employeeId, employee);
    return Ok(employee);
  }),

  // Get all Employees
  getEmployees: query([], Result(Vec(Employee), Message), () => {
    const employees = employeeStorage.values();
    if (employees.length === 0) return Err({ NotFound: "No employees found" });
    return Ok(employees);
  }),

  // Create Leave Request
  createLeaveRequest: update([LeaveRequestPayload], Result(LeaveRequest, Message), (payload) => {
    const { valid, employee, error } = validateEmployee(payload.employee_id);
    if (!valid) return Err({ NotFound: error });

    const { valid: balanceValid, leaveType, error: balanceError } = validateLeaveBalance(employee, payload.leave_type_id);
    if (!balanceValid) return Err({ Error: balanceError });

    if (checkLeaveOverlap(payload.employee_id, payload.start_date, payload.end_date)) {
      return Err({ Error: "Leave dates overlap with an existing request." });
    }

    if (payload.start_date > payload.end_date) {
      return Err({ InvalidPayload: "Start date cannot be later than end date." });
    }

    const leaveRequestId = uuidv4();
    const leaveRequest = {
      id: leaveRequestId,
      ...payload,
      status: "Pending",
      created_at: ic.time(),
    };

    leaveRequestStorage.insert(leaveRequestId, leaveRequest);
    return Ok(leaveRequest);
  }),

  deleteEmployee: update([text], Result(Message, Message), (employeeId) => {
    const employeeOpt = employeeStorage.get(employeeId);
    if ("None" in employeeOpt) return Err({ NotFound: "Employee not found" });

    // Check if the employee has any pending leave requests
    const hasPendingRequests = leaveRequestStorage
      .values()
      .some((req) => req.employee_id === employeeId && req.status === "Pending");

    if (hasPendingRequests) {
      return Err({ Error: "Cannot delete employee with pending leave requests." });
    }

    // Remove employee and associated leave requests
    employeeStorage.remove(employeeId);
    leaveRequestStorage.values().forEach((req) => {
      if (req.employee_id === employeeId) leaveRequestStorage.remove(req.id);
    });

    return Ok({ Success: "Employee and associated leave requests deleted." });
  }),

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
    const leaveRequestOpt = leaveRequestStorage.get(requestId);
    if ("None" in leaveRequestOpt) return Err({ NotFound: "Leave request not found" });

    const leaveRequest = leaveRequestOpt.Some;
    if (leaveRequest.status === "Approved") return Err({ Error: "Leave request is already approved." });

    const { valid, employee, error } = validateEmployee(leaveRequest.employee_id);
    if (!valid) return Err({ NotFound: error });

    const { valid: balanceValid, leaveType, error: balanceError } = validateLeaveBalance(employee, leaveRequest.leave_type_id);
    if (!balanceValid) return Err({ Error: balanceError });

    employee.leave_balances[leaveType.name] -= leaveType.quota;
    leaveRequest.status = "Approved";

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
    if (leaveTypes.length === 0) return Err({ NotFound: "No leave types found" });
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
    const leaveRequests = leaveRequestStorage.values().filter((request) => request.employee_id === employeeId);
    if (leaveRequests.length === 0) return Err({ NotFound: "No leave requests found for the employee." });

    const employeeOpt = employeeStorage.get(employeeId);
    if ("None" in employeeOpt) return Err({ NotFound: "Employee not found." });

    const employee = employeeOpt.Some;
    let report = `Leave report for ${employee.name} (Employee ID: ${employee.id})\n\n`;

    for (const request of leaveRequests) {
      const leaveTypeOpt = leaveTypeStorage.get(request.leave_type_id);
      if ("None" in leaveTypeOpt) return Err({ NotFound: `Leave type not found for request ID: ${request.id}` });

      const leaveType = leaveTypeOpt.Some;
      const leaveBalance = employee.leave_balances[leaveType.name] ?? 0n;

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
