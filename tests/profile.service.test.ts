import { describe, expect, it } from "vitest";

import { ProfileService } from "../src/modules/profile/profile.service.js";

describe("ProfileService", () => {
  it("creates the first admin team from Supabase auth without trusting user metadata roles", async () => {
    const db = createProfileDb();
    const service = new ProfileService({
      db,
      registrationMode: "first_admin"
    });

    const context = await service.bootstrapFromAuthUser(
      {
        id: "00000000-0000-0000-0000-000000000001",
        email: "anna@example.com",
        userMetadata: {
          role: "staff"
        }
      },
      {
        displayName: "Anna Admin",
        teamName: "Restaurant Mitte",
        createFirstAdmin: true
      }
    );

    expect(context.needsOnboarding).toBe(false);
    expect(context.profile).toMatchObject({
      authUserId: "00000000-0000-0000-0000-000000000001",
      email: "anna@example.com",
      displayName: "Anna Admin"
    });
    expect(context.activeTeam).toMatchObject({
      name: "Restaurant Mitte",
      role: "admin"
    });
    expect(context.effectiveActor).toMatchObject({
      authUserId: "00000000-0000-0000-0000-000000000001",
      role: "admin"
    });
    expect(db.teamMembers).toHaveLength(1);
    expect(db.teamMembers[0].role).toBe("admin");
  });

  it("updates profile fields but never changes role through profile updates", async () => {
    const db = createProfileDb();
    const service = new ProfileService({
      db,
      registrationMode: "open"
    });

    const context = await service.bootstrapFromAuthUser(
      {
        id: "00000000-0000-0000-0000-000000000002",
        email: "mia@example.com",
        userMetadata: {}
      },
      {
        displayName: "Mia Staff",
        teamName: "Team",
        createFirstAdmin: true
      }
    );

    const updated = await service.updateProfile(context.effectiveActor, {
      displayName: "Mia Service",
      preferredStorageLocationId: "loc-1"
    });

    expect(updated.profile).toMatchObject({
      displayName: "Mia Service",
      preferredStorageLocationId: "loc-1"
    });
    expect(updated.activeTeam?.role).toBe("admin");
  });
});

function createProfileDb() {
  const db = {
    userProfiles: [] as any[],
    teams: [] as any[],
    teamMembers: [] as any[],
    userProfile: {
      findUnique: async ({ where }: any) =>
        db.userProfiles.find(
          (profile) => profile.authUserId === where.authUserId || profile.id === where.id
        ) ?? null,
      create: async ({ data }: any) => {
        const profile = {
          id: `profile-${db.userProfiles.length + 1}`,
          displayName: null,
          avatarUrl: null,
          defaultTeamId: null,
          preferredStorageLocationId: null,
          preferencesJson: {},
          isActive: true,
          ...data
        };
        db.userProfiles.push(profile);
        return profile;
      },
      update: async ({ where, data }: any) => {
        const profile = db.userProfiles.find((item) => item.id === where.id);
        Object.assign(profile, data);
        return profile;
      }
    },
    team: {
      create: async ({ data }: any) => {
        const team = {
          id: `team-${db.teams.length + 1}`,
          defaultLocationId: null,
          ...data
        };
        db.teams.push(team);
        return team;
      }
    },
    teamMember: {
      count: async ({ where }: any) =>
        db.teamMembers.filter(
          (member) =>
            (!where.role || member.role === where.role) &&
            (!where.status || member.status === where.status)
        ).length,
      create: async ({ data }: any) => {
        const member = {
          id: `member-${db.teamMembers.length + 1}`,
          status: "active",
          ...data
        };
        db.teamMembers.push(member);
        return member;
      },
      findMany: async ({ where }: any) =>
        db.teamMembers
          .filter(
            (member) =>
              member.profileId === where.profileId &&
              (!where.status || member.status === where.status)
          )
          .map((member) => ({
            ...member,
            team: db.teams.find((team) => team.id === member.teamId)
          }))
    },
    $transaction: async (callback: any) => callback(db)
  };

  return db;
}
