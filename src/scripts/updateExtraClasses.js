const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function updateExistingExtraClasses() {
  try {
    // First get all extra classes without created_by
    const extraClasses = await prisma.extraClass.findMany({
      where: {
        created_by: null,
      },
    });

    // Update each record individually to properly handle the foreign key
    for (const extraClass of extraClasses) {
      await prisma.extraClass.update({
        where: {
          id: extraClass.id,
        },
        data: {
          created_by: extraClass.teacher_id,
        },
      });
    }

    console.log("Successfully updated existing extra classes");
  } catch (error) {
    console.error("Error updating extra classes:", error);
  } finally {
    await prisma.$disconnect();
  }
}

updateExistingExtraClasses();
