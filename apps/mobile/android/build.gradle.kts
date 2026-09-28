allprojects {
    repositories {
        google()
        mavenCentral()
    }
    configurations.all {
        resolutionStrategy {
            force("androidx.test.espresso:espresso-core:3.6.1")
            force("androidx.test.espresso:espresso-idling-resource:3.6.1")
        }
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
