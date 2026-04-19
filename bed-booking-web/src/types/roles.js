export const USER_ROLES = ["consumer", "owner", "superadmin"];
export function isUserRole(value) {
    return USER_ROLES.includes(value);
}
export function dashboardPathByRole(role) {
    if (role === "consumer")
        return "/consumer";
    if (role === "owner")
        return "/owner";
    return "/superadmin";
}
