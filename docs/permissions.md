# Permissions

Evaluated server-side on every mutation:

```
system role + membership status + ownership/relation
```

Client-supplied tenant id is ignored. Scope is the authenticated membership.

- `TEACHER + SCHOOL_ADMIN` allowed
- `TEACHER + MENTOR` forbidden
- Active student + Mentor forbidden
- Mentor requires `GRADUATED`
- Graduated: login, history, discussion read-only, apply mentor — no new student applications/bookings
