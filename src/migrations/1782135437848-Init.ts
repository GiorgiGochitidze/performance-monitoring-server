import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1782135437848 implements MigrationInterface {
    name = 'Init1782135437848'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "level" character varying NOT NULL, "message" text NOT NULL, "serverId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fb1b805f2f7795de79fa69340ba" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6adad5828278b45d308d45f106" ON "logs"  ("serverId") `);
        await queryRunner.query(`CREATE TABLE "servers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'ONLINE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "PK_c0947efd9f3db2dcc010164d20b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "logs" ADD CONSTRAINT "FK_6adad5828278b45d308d45f1069" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "servers" ADD CONSTRAINT "FK_ac4e28e480d3009b232b378f15f" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "servers" DROP CONSTRAINT "FK_ac4e28e480d3009b232b378f15f"`);
        await queryRunner.query(`ALTER TABLE "logs" DROP CONSTRAINT "FK_6adad5828278b45d308d45f1069"`);
        await queryRunner.query(`DROP TABLE "servers"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6adad5828278b45d308d45f106"`);
        await queryRunner.query(`DROP TABLE "logs"`);
    }

}
