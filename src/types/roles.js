export const HIDDEN_SUPERADMIN_PATH = "/internal-control";
export const USER_ROLES = ["consumer", "owner", "operator", "superadmin"];

export function isUserRole(value) {
    return USER_ROLES.includes(value);
}

export function dashboardPathByRole(role) {
    if (role === "consumer")
        return "/consumer";
    if (role === "owner")
        return "/owner";
    if (role === "operator")
        return "/operator";
    return HIDDEN_SUPERADMIN_PATH;
}

export function defaultPostAuthPath(role) {
    if (role === "owner" || role === "operator" || role === "superadmin") {
        return dashboardPathByRole(role);
    }
    return "/";
}

export function roleLabel(role) {
    if (role === "superadmin")
        return "Superadmin";
    if (role === "operator")
        return "Operator";
    if (role === "owner")
        return "Owner";
    return "Consumer";
}
